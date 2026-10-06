import { expect, test, type Locator, type Page } from '@playwright/test';
import { Result, Schema } from 'effect';
import { RoomStateMessage } from '../packages/protocol/src/index';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:5173';

const CreateRoomResponseSchema = Schema.Struct({ roomCode: Schema.String });
type RoomState = Schema.Schema.Type<typeof RoomStateMessage>;

test.describe('first playable race', () => {
  test.describe.configure({ mode: 'serial' });

  test('creates a solo room, starts a race, accepts controls, and shows the result', async ({ page }) => {
    test.slow();
    await openGame(page);

    const createResponse = page.waitForResponse(
      (response) => response.url().includes('/api/rooms') && response.request().method() === 'POST',
    );
    await fillRiderName(page, 'Smoke Rider');
    await page.getByRole('button', { name: /ride solo/i }).click();

    const roomResponse = Schema.decodeUnknownResult(CreateRoomResponseSchema)(await (await createResponse).json());
    if (!Result.isSuccess(roomResponse)) throw new Error('Create room response did not match the expected shape');
    const room = roomResponse.success;
    expect(room.roomCode).toMatch(/^[A-Z2-9]{6}$/);
    await expect.poll(() => getRoomState(page, room.roomCode), { timeout: 10_000 }).toMatchObject({
      players: expect.arrayContaining([expect.objectContaining({ displayName: 'Smoke Rider', kind: 'human' })]),
    });

    await expect.poll(() => getRoomState(page, room.roomCode), { timeout: 10_000 }).toMatchObject({
      phase: expect.stringMatching(/countdown|racing|finished/),
    });

    await expectRaceSurface(page);

    await page.keyboard.down('ArrowUp');
    try {
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(350);
      await page.keyboard.up('ArrowRight');
      await page.keyboard.down(' ');
      await page.waitForTimeout(250);
      await page.keyboard.up(' ');

      await expect(page.getByText('COURSE', { exact: true })).toBeVisible();
      await test.info().attach('solo-race-hud', {
        body: await page.screenshot({ fullPage: false }),
        contentType: 'image/png',
      });

      const finalState = await waitForRoomPhase(page, room.roomCode, 'finished');
      await expect(page.getByText(/RACE COMPLETE|YOU TAKE IT|PHOTO FINISH/i).first()).toBeVisible({ timeout: 20_000 });
      await expectRenderedStandings(page, finalState, 'Smoke Rider');
      expect(finalState.players.length).toBe(4);
      expect(finalState.players.some((player) => Number.isInteger(player.place) && player.place >= 1)).toBe(true);
    } finally {
      await page.keyboard.up('ArrowUp');
    }
  });

  test('lets a second browser context join the same room before the host starts', async ({ browser, page }) => {
    test.slow();
    const guest = await browser.newContext();
    try {
      const guestPage = await guest.newPage();
      await openGame(page);
      const createResponse = page.waitForResponse(
        (response) => response.url().includes('/api/rooms') && response.request().method() === 'POST',
      );
      await fillRiderName(page, 'Host Rider');
      await page.getByRole('button', { name: /create invite room/i }).click();
      const roomResponse = Schema.decodeUnknownResult(CreateRoomResponseSchema)(await (await createResponse).json());
      if (!Result.isSuccess(roomResponse)) throw new Error('Create room response did not match the expected shape');
      const room = roomResponse.success;
      expect(room.roomCode).toMatch(/^[A-Z2-9]{6}$/);
      await expectRoomLobby(page, room.roomCode);
      await expect.poll(() => getRoomState(page, room.roomCode), { timeout: 10_000 }).toMatchObject({
        phase: 'lobby',
        players: expect.arrayContaining([expect.objectContaining({ displayName: 'Host Rider', kind: 'human' })]),
      });

      await openGame(guestPage);
      await fillRiderName(guestPage, 'Guest Rider');
      await joinRoom(guestPage, room.roomCode);

      await expect.poll(() => getRoomState(page, room.roomCode), { timeout: 10_000 }).toMatchObject({
        phase: 'lobby',
        players: expect.arrayContaining([
          expect.objectContaining({ displayName: 'Host Rider', kind: 'human' }),
          expect.objectContaining({ displayName: 'Guest Rider', kind: 'human' }),
        ]),
      });

      await expect(page.getByText(/Ready when|waiting for host/i).first()).toBeVisible({ timeout: 10_000 });
      await expect(guestPage.getByText(/Ready when|waiting for host/i).first()).toBeVisible();

      await page.getByRole('button', { name: /start the race/i }).click();
      await expect.poll(() => getRoomState(page, room.roomCode), { timeout: 10_000 }).toMatchObject({
        phase: expect.stringMatching(/countdown|racing|finished/),
        players: expect.arrayContaining([
          expect.objectContaining({ displayName: 'Host Rider', kind: 'human' }),
          expect.objectContaining({ displayName: 'Guest Rider', kind: 'human' }),
        ]),
      });
      await expectRaceSurface(page);
      await expectRaceSurface(guestPage);

      const hostFinalState = await waitForRoomPhase(page, room.roomCode, 'finished');
      const guestFinalState = await waitForRoomPhase(guestPage, room.roomCode, 'finished');
      expect(rankedPlayerIds(hostFinalState)).toEqual(rankedPlayerIds(guestFinalState));
      await expectRenderedStandings(page, hostFinalState, 'Host Rider');
      await expectRenderedStandings(guestPage, guestFinalState, 'Guest Rider');
    } finally {
      await guest.close();
    }
  });
});

async function openGame(page: Page): Promise<void> {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).not.toContainText(/application error|failed to compile|vite error|cannot read/i);
  await expect(page.locator('body')).not.toBeEmpty();
}

async function fillRiderName(page: Page, name: string): Promise<void> {
  const field = await firstVisible(page, [
    page.getByLabel(/nickname|display name|rider name|your name/i),
    page.getByRole('textbox').first(),
  ]);
  await field.fill(name);
}

async function joinRoom(page: Page, roomCode: string | undefined): Promise<void> {
  const code = requireRoomCode(roomCode);
  const roomField = await firstVisible(page, [
    page.getByLabel(/room code|race code|invite code/i),
    page.getByPlaceholder(/room|code|invite/i),
  ]);
  await roomField.fill(code);
  await page.getByRole('button', { name: 'join room', exact: true }).click();
}

async function expectRoomLobby(page: Page, roomCode: string | undefined): Promise<void> {
  const code = requireRoomCode(roomCode);
  await expect(page.getByText(code, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/lobby|waiting|ready/i).first()).toBeVisible();
}

async function expectRaceSurface(page: Page): Promise<void> {
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel('Race telemetry')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('COURSE', { exact: true })).toBeVisible({ timeout: 10_000 });
}

async function getRoomState(page: Page, roomCode: string | undefined): Promise<RoomState> {
  const code = requireRoomCode(roomCode);
  const response = await page.request.get(new URL(`/api/rooms/${code}`, baseUrl).toString());
  expect(response.ok()).toBe(true);
  const decoded = Schema.decodeUnknownResult(RoomStateMessage)(await response.json());
  if (!Result.isSuccess(decoded)) throw new Error('Room state response did not match the expected shape');
  return decoded.success;
}

async function waitForRoomPhase(page: Page, roomCode: string | undefined, phase: RoomState['phase']): Promise<RoomState> {
  let state: RoomState = await getRoomState(page, roomCode);
  await expect.poll(async () => {
    state = await getRoomState(page, roomCode);
    return state.phase;
  }, { timeout: 75_000, polling: 1_000 }).toBe(phase);
  return state;
}

async function firstVisible(page: Page, locators: Locator[]): Promise<Locator> {
  for (const locator of locators) {
    if ((await locator.count()) > 0 && await locator.first().isVisible()) return locator.first();
  }
  throw new Error('Could not find a visible control for the requested flow');
}

function requireRoomCode(roomCode: string | undefined): string {
  if (roomCode === undefined || roomCode.length === 0) throw new Error('Expected a room code');
  return roomCode;
}

function rankedPlayerIds(state: RoomState): readonly string[] {
  return rankedPlayers(state).map((player) => player.playerId);
}

interface RankedPlayer {
  playerId: string;
  displayName: string;
  place: number;
}

function rankedPlayers(state: RoomState): readonly RankedPlayer[] {
  return state.players
    .flatMap((player) => player.place === undefined ? [] : [{
      playerId: player.playerId,
      displayName: player.displayName,
      place: player.place,
    }])
    .sort((left, right) => left.place - right.place);
}

async function expectRenderedStandings(page: Page, state: RoomState, localDisplayName: string): Promise<void> {
  const standings = page.getByLabel('Final standings');
  await expect(standings).toBeVisible({ timeout: 20_000 });
  const ranked = rankedPlayers(state);
  expect(ranked).toHaveLength(4);
  const rows = standings.locator('.finish-standing');
  await expect(rows).toHaveCount(4);
  for (const [index, player] of ranked.entries()) {
    const row = rows.nth(index);
    await expect(row).toBeVisible();
    await expect(row.getByText(String(player.place).padStart(2, '0'), { exact: true })).toBeVisible();
    await expect(row.getByText(player.displayName, { exact: true })).toBeVisible();
  }
  const localRow = rows.filter({ hasText: localDisplayName });
  await expect(localRow).toHaveCount(1);
  await expect(localRow.getByText('YOU', { exact: true })).toBeVisible();
}
