// webOS CLI's directory staging works on modern Node, but its legacy
// fstream-based IPK writer can exit without producing a package.
import { execFile as execFileCallback } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const service = join(root, 'webos/service/com.biliwebos.app.service');

export function createPackageInfo(
  id: string,
  version: string,
  services: string[],
) {
  if (
    !id ||
    !version ||
    services.length === 0 ||
    services.some((name) => !name)
  ) {
    throw new Error('App id, version, and service names are required');
  }
  return { id, version, app: id, services };
}

async function treeSize(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    total += entry.isDirectory()
      ? await treeSize(file)
      : (await stat(file)).size;
  }
  return total;
}

function arEntry(name: string, contents: Buffer): Buffer {
  const pad = (value: string | number, width: number) =>
    String(value).padEnd(width, ' ');
  const header = Buffer.from(
    pad(name, 16) +
      pad(Math.floor(Date.now() / 1000), 12) +
      pad(0, 6) +
      pad(0, 6) +
      pad('100644', 8) +
      pad(contents.length, 10) +
      '`\n',
    'ascii',
  );
  return Buffer.concat([
    header,
    contents,
    ...(contents.length % 2 ? [Buffer.from('\n')] : []),
  ]);
}

async function main() {
  const { id, version } = JSON.parse(
    await readFile(join(dist, 'appinfo.json'), 'utf8'),
  );
  if (!id || !version)
    throw new Error('dist/appinfo.json must contain id and version');

  const temp = await mkdtemp(join(tmpdir(), 'bili-webos-package-'));
  try {
    const staged = join(temp, 'staged');
    const controlDir = join(temp, 'control');
    await mkdir(controlDir);

    console.log('[package] Staging app and service...');
    await execFile(
      'ares-package',
      ['--rom', '--no-minify', '--outdir', staged, dist, service],
      { cwd: root },
    );

    await access(join(staged, 'usr/palm/applications', id, 'appinfo.json'));
    await access(
      join(staged, 'usr/palm/services/com.biliwebos.app.service/services.json'),
    );

    // `ares-package --rom` omits packageinfo.json. A normal IPK needs it
    // to associate the app with its Luna JS service at install time.
    const serviceConfig = JSON.parse(
      await readFile(
        join(
          staged,
          'usr/palm/services/com.biliwebos.app.service/services.json',
        ),
        'utf8',
      ),
    );
    const packageInfo = createPackageInfo(
      id,
      version,
      (serviceConfig.services || []).map(({ name }) => name),
    );
    const packageDir = join(staged, 'usr/palm/packages', id);
    await mkdir(packageDir, { recursive: true });
    await writeFile(
      join(packageDir, 'packageinfo.json'),
      JSON.stringify(packageInfo, null, 2) + '\n',
    );

    await writeFile(
      join(controlDir, 'control'),
      [
        `Package: ${id}`,
        `Version: ${version}`,
        'Section: misc',
        'Priority: optional',
        'Architecture: all',
        `Installed-Size: ${await treeSize(staged)}`,
        'Maintainer: N/A <nobody@example.com>',
        'Description: This is a webOS application.',
        'webOS-Package-Format-Version: 2',
        'webOS-Packager-Version: x.y.x',
        '',
      ].join('\n'),
    );

    const controlTar = join(temp, 'control.tar.gz');
    const dataTar = join(temp, 'data.tar.gz');
    await execFile('tar', ['-czf', controlTar, '-C', controlDir, 'control'], {
      env: { ...process.env, COPYFILE_DISABLE: '1' },
    });
    await execFile('tar', ['-czf', dataTar, '-C', staged, 'usr'], {
      env: { ...process.env, COPYFILE_DISABLE: '1' },
    });

    const ipk = join(dist, `${id}_${version}_all.ipk`);
    const archive = Buffer.concat([
      Buffer.from('!<arch>\n', 'ascii'),
      arEntry('debian-binary', Buffer.from('2.0\n')),
      arEntry('control.tar.gz', await readFile(controlTar)),
      arEntry('data.tar.gz', await readFile(dataTar)),
    ]);
    await writeFile(ipk, archive);
    console.log(`[package] Created ${ipk} (${archive.length} bytes)`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('[package] Failed:', err);
    process.exitCode = 1;
  });
}
