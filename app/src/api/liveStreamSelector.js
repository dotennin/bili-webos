function buildUrl(codec) {
  const info = (codec.url_info || [{}])[0];
  return (info.host || '') + (codec.base_url || '') + (info.extra || '');
}

function qnMatches(codec, preferredQn) {
  if (!preferredQn) return true;
  const qn = Number(preferredQn);
  if (!Number.isFinite(qn) || qn <= 0) return true;
  const candidates = [
    codec.current_qn,
    codec.qn,
    codec.quality,
    codec.desire_qn,
  ].map(Number).filter(Number.isFinite);
  if (candidates.includes(qn)) return true;
  const acceptList = codec.accept_qn || codec.acceptQn || codec.available_qn || codec.availableQn || [];
  if (Array.isArray(acceptList) && acceptList.map(Number).includes(qn)) return true;
  return false;
}

function extractQualityValues(codec) {
  var values = [];
  if (!codec) return values;

  [codec.current_qn, codec.qn, codec.quality, codec.desire_qn].forEach(function (value) {
    var n = Number(value);
    if (Number.isFinite(n) && n > 0) values.push(n);
  });

  var acceptList = codec.accept_qn || codec.acceptQn || codec.available_qn || codec.availableQn || [];
  if (Array.isArray(acceptList)) {
    acceptList.forEach(function (value) {
      var n = Number(value);
      if (Number.isFinite(n) && n > 0) values.push(n);
    });
  }

  return values;
}

function collectAvailableQualities(streams) {
  var seen = new Set();
  var values = [];

  (streams || []).forEach(function (stream) {
    if (stream.protocol_name !== 'http_stream' && stream.protocol_name !== 'http_hls') return;
    (stream.format || []).forEach(function (format) {
      (format.codec || []).forEach(function (codec) {
        if (codec.codec_name !== 'avc') return;
        extractQualityValues(codec).forEach(function (value) {
          if (seen.has(value)) return;
          seen.add(value);
          values.push(value);
        });
      });
    });
  });

  return values.sort(function (a, b) { return b - a; });
}

function findPreferredCodec(streams, protocolName, preferredFormats, preferredQn) {
  for (const formatName of preferredFormats) {
    for (const stream of streams || []) {
      if (stream.protocol_name !== protocolName) continue;
      for (const format of stream.format || []) {
        if (format.format_name !== formatName) continue;
        for (const codec of format.codec || []) {
          if (codec.codec_name === 'avc' && qnMatches(codec, preferredQn)) return codec;
        }
      }
    }
  }
  return null;
}

export function selectLiveStreamSource(streams, preferredQn) {
  const flvCodec = findPreferredCodec(streams, 'http_stream', ['flv'], preferredQn);
  if (flvCodec) {
    return {
      type: 'flv',
      url: buildUrl(flvCodec),
      currentQuality: Number(flvCodec.current_qn || flvCodec.qn || flvCodec.quality || flvCodec.desire_qn || 0) || 0,
      availableQualities: collectAvailableQualities(streams),
    };
  }

  const hlsCodec = findPreferredCodec(streams, 'http_hls', ['fmp4', 'ts'], preferredQn);
  if (hlsCodec) {
    return {
      type: 'hls',
      url: buildUrl(hlsCodec),
      currentQuality: Number(hlsCodec.current_qn || hlsCodec.qn || hlsCodec.quality || hlsCodec.desire_qn || 0) || 0,
      availableQualities: collectAvailableQualities(streams),
    };
  }

  return null;
}

export function selectLiveStreamUrl(streams, preferredQn) {
  return selectLiveStreamSource(streams, preferredQn)?.url || null;
}
