// Keep the latest Play command until the TV UI is ready to receive it.
export class CastEventRelay {
  subscribers: any[] = [];
  pendingPlay: any = null;
  getStatus: () => any;

  constructor(getStatus: () => any) {
    this.getStatus = getStatus;
  }

  notify(event) {
    const command = event.kind === 'command' ? event.command : null;
    if (command?.type === 'play') {
      this.pendingPlay = event;
    } else if (command?.type === 'stop') {
      this.pendingPlay = null;
    } else if (
      command?.type === 'seek' &&
      this.pendingPlay &&
      Number.isFinite(command.positionSec)
    ) {
      this.pendingPlay = {
        kind: 'command',
        command: { ...this.pendingPlay.command, seekTs: command.positionSec },
      };
    }

    let delivered = false;
    this.subscribers = this.subscribers.filter((message) => {
      try {
        message.respond({
          returnValue: true,
          subscribed: true,
          event,
          status: this.getStatus(),
        });
        delivered = true;
        return true;
      } catch {
        return false;
      }
    });
    if (delivered && command?.type === 'play') this.pendingPlay = null;
  }

  subscribe(message) {
    const event = this.pendingPlay || { kind: 'ready' };
    try {
      message.respond({
        returnValue: true,
        subscribed: true,
        event,
        status: this.getStatus(),
      });
      this.subscribers.push(message);
      if (event === this.pendingPlay) this.pendingPlay = null;
    } catch {
      // Keep the pending Play so a later subscription can claim it.
    }
  }
}
