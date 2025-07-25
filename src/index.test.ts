import { InteractionResponseType, InteractionType } from 'discord-interactions';
import nacl from 'tweetnacl';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { expectInteractionResponse } from '../tests/helpers/interaction-schemas';
import app from './index';

// Discord署名のモック
function createDiscordRequest(body: any, _publicKey: string, privateKey: Uint8Array): Request {
  const timestamp = Date.now().toString();
  const bodyString = JSON.stringify(body);

  const message = Buffer.concat([Buffer.from(timestamp), Buffer.from(bodyString)]);

  const signature = Buffer.from(nacl.sign.detached(message, privateKey)).toString('hex');

  return new Request('http://localhost/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature-Ed25519': signature,
      'X-Signature-Timestamp': timestamp,
    },
    body: bodyString,
  });
}

describe('Discordボット', () => {
  let publicKey: string;
  let privateKey: Uint8Array;

  beforeAll(() => {
    // Generate test keys
    const keyPair = nacl.sign.keyPair();
    publicKey = Buffer.from(keyPair.publicKey).toString('hex');
    privateKey = keyPair.secretKey;
  });

  it('ルートエンドポイントにレスポンスする', async () => {
    const env = {
      DISCORD_PUBLIC_KEY: publicKey,
      DISCORD_APPLICATION_ID: 'test_app_id',
      DISCORD_TOKEN: 'test_token',
      DB: {} as D1Database,
    };

    const res = await app.fetch(new Request('http://localhost/'), env);

    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string; service: string };
    expect(json.status).toBe('ok');
    expect(json.service).toBe('Discord Choseisan Bot');
  });

  it('PINGインタラクションにレスポンスする', async () => {
    const mockExecutionContext = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    const env = {
      DISCORD_PUBLIC_KEY: publicKey,
      DISCORD_APPLICATION_ID: 'test_app_id',
      DISCORD_TOKEN: 'test_token',
      DB: {} as D1Database,
    };

    const interaction = {
      type: InteractionType.PING,
    };

    const req = createDiscordRequest(interaction, publicKey, privateKey);
    const res = await app.fetch(req, env, mockExecutionContext);

    expect(res.status).toBe(200);
    const json = expectInteractionResponse(await res.json());
    expect(json.type).toBe(InteractionResponseType.PONG);
  });

  it('should reject invalid signatures', async () => {
    const mockExecutionContext = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    const wrongKeyPair = nacl.sign.keyPair();
    const wrongPublicKey = Buffer.from(wrongKeyPair.publicKey).toString('hex');

    const env = {
      DISCORD_PUBLIC_KEY: wrongPublicKey, // Different public key
      DISCORD_APPLICATION_ID: 'test_app_id',
      DISCORD_TOKEN: 'test_token',
      DB: {} as D1Database,
    };

    const interaction = {
      type: InteractionType.PING,
    };

    // Request signed with original privateKey but validated with wrongPublicKey
    const req = createDiscordRequest(interaction, publicKey, privateKey);
    const res = await app.fetch(req, env, mockExecutionContext);

    expect(res.status).toBe(401);
  });

  it('should handle chouseichan command without subcommand', async () => {
    const mockExecutionContext = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    const env = {
      DISCORD_PUBLIC_KEY: publicKey,
      DISCORD_APPLICATION_ID: 'test_app_id',
      DISCORD_TOKEN: 'test_token',
      DB: {} as D1Database,
    };

    const interaction = {
      type: InteractionType.APPLICATION_COMMAND,
      id: 'test_id',
      data: {
        id: 'cmd_id',
        name: 'chouseichan',
      },
      token: 'test_token',
    };

    const req = createDiscordRequest(interaction, publicKey, privateKey);
    const res = await app.fetch(req, env, mockExecutionContext);

    expect(res.status).toBe(200);
    const json = expectInteractionResponse(await res.json());
    expect(json.type).toBe(InteractionResponseType.MODAL);
    expect(json.data).toBeDefined();
  });

  it('should handle button interactions', async () => {
    const mockExecutionContext = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    const env = {
      DISCORD_PUBLIC_KEY: publicKey,
      DISCORD_APPLICATION_ID: 'test_app_id',
      DISCORD_TOKEN: 'test_token',
      DB: {} as D1Database,
    };

    const interaction = {
      type: InteractionType.MESSAGE_COMPONENT,
      id: 'test_id',
      data: {
        custom_id: 'unknown:button', // Unknown button with correct format
        component_type: 2,
      },
      token: 'test_token',
      message: {
        id: 'msg_id',
        embeds: [],
      },
    };

    const req = createDiscordRequest(interaction, publicKey, privateKey);
    const res = await app.fetch(req, env, mockExecutionContext);

    expect(res.status).toBe(200);
    const json = expectInteractionResponse(await res.json());
    expect(json.type).toBe(InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
    expect(json.data?.content).toBe('不明なボタンです。');
    expect(json.data?.flags).toBe(64); // Ephemeral
  });
});
