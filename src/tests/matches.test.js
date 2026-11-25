import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MatchRepository } from '../repository/MatchRepository.js';
import { BetRepository } from '../repository/BetRepository.js';
import { MatchService } from '../service/MatchService.js';
import { BetService } from '../service/BetService.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { createApp } from '../app.js';

const silentLogger = { info: () => {}, error: () => {} };
const futureKickoff = (hours = 2) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

describe('Unit Tests: MatchService CRUD', () => {
  it('1. Creates, reads, and lists matches, and throws NotFoundError for missing match', () => {
    const matchRepo = new MatchRepository();
    const betRepo = new BetRepository();
    const matchService = new MatchService(matchRepo, silentLogger, betRepo);

    const created = matchService.createMatch({
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      kickoffTime: futureKickoff(),
      odds: { 1: 1.9, X: 3.5, 2: 4.0 },
    });

    assert.equal(created.id, 1);
    assert.equal(matchService.getMatchById(1).homeTeam, 'Arsenal');
    assert.equal(matchService.listMatches().length, 1);
    assert.throws(() => matchService.getMatchById(999), NotFoundError);
  });

  it('2. Updates odds and status, and rejects updates on CLOSED or CANCELLED matches', () => {
    const matchRepo = new MatchRepository();
    const betRepo = new BetRepository();
    const matchService = new MatchService(matchRepo, silentLogger, betRepo);

    const match = matchService.createMatch({
      homeTeam: 'Liverpool',
      awayTeam: 'Everton',
      kickoffTime: futureKickoff(),
      odds: { 1: 1.5, X: 4.2, 2: 6.0 },
    });

    const updatedOdds = matchService.updateMatch(match.id, {
      odds: { 1: 1.65, X: 3.9, 2: 5.5 },
    });
    assert.deepEqual(updatedOdds.odds, { 1: 1.65, X: 3.9, 2: 5.5 });
    assert.equal(updatedOdds.status, 'OPEN');

    const closed = matchService.updateMatch(match.id, { status: 'CLOSED' });
    assert.equal(closed.status, 'CLOSED');

    assert.throws(
      () => matchService.updateMatch(match.id, { status: 'OPEN' }),
      ConflictError
    );

    const match2 = matchService.createMatch({
      homeTeam: 'Inter',
      awayTeam: 'Milan',
      kickoffTime: futureKickoff(),
      odds: { 1: 2.1, X: 3.3, 2: 3.4 },
    });
    matchService.updateMatch(match2.id, { status: 'CANCELLED' });

    assert.throws(
      () => matchService.updateMatch(match2.id, { odds: { 1: 2.2, X: 3.2, 2: 3.3 } }),
      ConflictError
    );
  });

  it('3. Deletes a match when no bets exist, and throws ConflictError when bets exist', () => {
    const matchRepo = new MatchRepository();
    const betRepo = new BetRepository();
    const matchService = new MatchService(matchRepo, silentLogger, betRepo);
    const betService = new BetService(
      betRepo,
      matchRepo,
      { lockMinutesBeforeKickoff: 15, maxStake: 250 },
      silentLogger
    );

    const m1 = matchService.createMatch({
      homeTeam: 'PSG',
      awayTeam: 'Lyon',
      kickoffTime: futureKickoff(),
      odds: { 1: 1.4, X: 4.5, 2: 7.0 },
    });
    const m2 = matchService.createMatch({
      homeTeam: 'Ajax',
      awayTeam: 'PSV',
      kickoffTime: futureKickoff(),
      odds: { 1: 2.4, X: 3.4, 2: 2.8 },
    });

    betService.placeBet({ userId: 'u1', matchId: m2.id, selection: '1', stake: 50 });

    matchService.deleteMatch(m1.id);
    assert.throws(() => matchService.getMatchById(m1.id), NotFoundError);
    assert.throws(() => matchService.deleteMatch(m1.id), NotFoundError);
    assert.throws(() => matchService.deleteMatch(m2.id), ConflictError);
  });
});

describe('Integration Tests: /matches Full CRUD API', () => {
  it('4. Create & Read: POST /matches (201), GET /matches (200), GET /matches/:id (200)', async () => {
    const app = createApp();
    const server = app.listen(0);
    const baseUrl = `http://localhost:${server.address().port}`;

    try {
      const createRes = await fetch(`${baseUrl}/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTeam: 'Barcelona',
          awayTeam: 'Atletico Madrid',
          kickoffTime: futureKickoff(),
          odds: { 1: 1.8, X: 3.6, 2: 4.3 },
        }),
      });

      assert.equal(createRes.status, 201);
      assert.equal(createRes.headers.get('location'), '/matches/1');
      const created = await createRes.json();
      assert.equal(created.id, 1);

      const listRes = await fetch(`${baseUrl}/matches`);
      assert.equal(listRes.status, 200);
      const list = await listRes.json();
      assert.equal(list.length, 1);

      const getRes = await fetch(`${baseUrl}/matches/1`);
      assert.equal(getRes.status, 200);
      const fetched = await getRes.json();
      assert.equal(fetched.awayTeam, 'Atletico Madrid');
    } finally {
      server.close();
    }
  });

  it('5. Update: PATCH /matches/:id updates odds & status, preserves locked bet odds, and blocks updates once CLOSED/CANCELLED', async () => {
    const app = createApp();
    const server = app.listen(0);
    const baseUrl = `http://localhost:${server.address().port}`;

    try {
      await fetch(`${baseUrl}/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTeam: 'Juventus',
          awayTeam: 'Napoli',
          kickoffTime: futureKickoff(),
          odds: { 1: 2.0, X: 3.3, 2: 3.7 },
        }),
      });

      // Place a bet at initial odds (2.0)
      const betRes = await fetch(`${baseUrl}/bets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'u1', matchId: 1, selection: '1', stake: 100 }),
      });
      assert.equal(betRes.status, 201);
      const bet = await betRes.json();
      assert.equal(bet.lockedOdds, 2.0);

      // Update match odds
      const patchOddsRes = await fetch(`${baseUrl}/matches/1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ odds: { 1: 2.5, X: 3.1, 2: 2.9 } }),
      });
      assert.equal(patchOddsRes.status, 200);
      const updated = await patchOddsRes.json();
      assert.deepEqual(updated.odds, { 1: 2.5, X: 3.1, 2: 2.9 });

      // Existing bet keeps its snapshotted lockedOdds
      const checkBetRes = await fetch(`${baseUrl}/bets/1`);
      assert.equal((await checkBetRes.json()).lockedOdds, 2.0);

      // Close match
      const closeRes = await fetch(`${baseUrl}/matches/1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED' }),
      });
      assert.equal(closeRes.status, 200);
      assert.equal((await closeRes.json()).status, 'CLOSED');

      // Further PATCH on CLOSED match -> 409 ConflictError
      const reopenRes = await fetch(`${baseUrl}/matches/1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'OPEN' }),
      });
      assert.equal(reopenRes.status, 409);
      assert.equal((await reopenRes.json()).type, '/problems/conflict');

      // Betting on CLOSED match -> 409 ConflictError
      const closedBetRes = await fetch(`${baseUrl}/bets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'u2', matchId: 1, selection: '2', stake: 20 }),
      });
      assert.equal(closedBetRes.status, 409);
    } finally {
      server.close();
    }
  });

  it('6. Update validation & 404: PATCH /matches/:id rejects empty body, disallowed fields, partial odds, and missing match', async () => {
    const app = createApp();
    const server = app.listen(0);
    const baseUrl = `http://localhost:${server.address().port}`;

    try {
      await fetch(`${baseUrl}/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTeam: 'Roma',
          awayTeam: 'Lazio',
          kickoffTime: futureKickoff(),
          odds: { 1: 2.3, X: 3.2, 2: 3.1 },
        }),
      });

      const invalidPayloads = [
        {},
        { homeTeam: 'New Team' },
        { odds: { 1: 2.5 } },
        { status: 'PAUSED' },
      ];

      for (const payload of invalidPayloads) {
        const res = await fetch(`${baseUrl}/matches/1`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        assert.equal(res.status, 422);
        assert.match(res.headers.get('content-type'), /application\/problem\+json/);
        const body = await res.json();
        assert.equal(body.type, '/problems/validation-error');
        assert.ok(Object.keys(body.errors).length > 0);
      }

      const notFoundRes = await fetch(`${baseUrl}/matches/999`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      assert.equal(notFoundRes.status, 404);
      assert.equal((await notFoundRes.json()).type, '/problems/not-found');
    } finally {
      server.close();
    }
  });

  it('7. Delete: DELETE /matches/:id returns 204 when unused, 409 if bets exist, and 404 when missing', async () => {
    const app = createApp();
    const server = app.listen(0);
    const baseUrl = `http://localhost:${server.address().port}`;

    try {
      // Create match 1 (will stay unused) and match 2 (will have a bet)
      for (const [homeTeam, awayTeam] of [
        ['Benfica', 'Porto'],
        ['Celtic', 'Rangers'],
      ]) {
        await fetch(`${baseUrl}/matches`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            homeTeam,
            awayTeam,
            kickoffTime: futureKickoff(),
            odds: { 1: 2.0, X: 3.4, 2: 3.6 },
          }),
        });
      }

      await fetch(`${baseUrl}/bets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'u1', matchId: 2, selection: '1', stake: 50 }),
      });

      // Delete match 1 -> 204 No Content
      const delRes = await fetch(`${baseUrl}/matches/1`, { method: 'DELETE' });
      assert.equal(delRes.status, 204);
      assert.equal(await delRes.text(), '');

      // Verify deleted -> 404 on GET and second DELETE
      const getDeletedRes = await fetch(`${baseUrl}/matches/1`);
      assert.equal(getDeletedRes.status, 404);

      const delMissingRes = await fetch(`${baseUrl}/matches/1`, { method: 'DELETE' });
      assert.equal(delMissingRes.status, 404);

      // Delete match 2 with existing bet -> 409 ConflictError
      const delWithBetRes = await fetch(`${baseUrl}/matches/2`, { method: 'DELETE' });
      assert.equal(delWithBetRes.status, 409);
      const conflictBody = await delWithBetRes.json();
      assert.equal(conflictBody.type, '/problems/conflict');
    } finally {
      server.close();
    }
  });
});

