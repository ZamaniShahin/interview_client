// The hub connection lives in main only: tokens never reach a renderer, and an overlay reload doesn't drop the session.
// This builds the connection over the generated contract. Checkpoint 1.12 drives it: the access token from sign-in
// (1.10), device proofs, ResumeSession after a drop, and a SessionDriver that feeds the SessionController.
import { HttpTransportType, HubConnectionBuilder, LogLevel, type HubConnection } from '@microsoft/signalr';
import { MessagePackHubProtocol } from '@microsoft/signalr-protocol-msgpack';
import {
  createLiveHub,
  Protocol,
  registerLiveClient,
  type LiveClient,
  type LiveHub,
} from '../../shared/contracts/sotto-contracts';

export interface LiveConnectionOptions {
  apiBaseUrl: string;
  /** This build's version, checked by the server against the minimum it accepts. */
  clientVersion: string;
  /** The current access token; refreshed by the sign-in module, one refresh at a time. */
  accessToken: () => Promise<string>;
  events: LiveClient;
}

export interface LiveConnection {
  connection: HubConnection;
  hub: LiveHub;
  stopListening: () => void;
}

export function createLiveConnection(options: LiveConnectionOptions): LiveConnection {
  const url = new URL(Protocol.HubPath, options.apiBaseUrl);
  url.searchParams.set('pv', String(Protocol.Version));

  const connection = new HubConnectionBuilder()
    .withUrl(url.toString(), {
      // The server maps the hub on WebSockets only (backend decisions, 1.2–1.4).
      transport: HttpTransportType.WebSockets,
      skipNegotiation: true,
      accessTokenFactory: options.accessToken,
      headers: { [Protocol.ClientVersionHeader]: options.clientVersion },
    })
    // Contractless MessagePack, keys spelled as the C# names: the contract's types already spell them so.
    .withHubProtocol(new MessagePackHubProtocol())
    // No automatic reconnect: after a drop the session must be resumed (ResumeSession with LastSeq), which the
    // built-in retry knows nothing about. 1.12 reconnects and resumes itself.
    .configureLogging(LogLevel.Warning)
    .build();

  const stopListening = registerLiveClient(connection, options.events);
  return { connection, hub: createLiveHub(connection), stopListening };
}
