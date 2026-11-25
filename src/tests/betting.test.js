import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MatchRepository } from '../repository/MatchRepository.js';
import { BetRepository } from '../repository/BetRepository.js';
import { MatchService } from '../service/MatchService.js';
import { BetService } from '../service/BetService.js';
import { ConflictError } from '../errors.js';
import { createApp } from '../app.js';

// A quiet logger so test output stays clean
const silentLogger = { info: () => {}, error: () => {} };

describe('Unit Tests: BetService (No HTTP Server)', () => {
  it('1. Snapshots locked odds and calculates potential return accurately', () => {
    const matchRepo = new MatchRepository();
    const betRepo = new BetRepository();
    const config = { lockMinutesBeforeKickoff: 15, maxStake: 250 };
    const matchService = new MatchService(matchRepo, silentLogger);
    const betService = new BetService(betRepo, matchRepo, config, silentLogger);

    const kickoff = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
    const match = matchService.createMatch({
      homeTeam: 'Manchester City',
      awayTeam: 'Arsenal',
      kickoffTime: kickoff,
      odds: { 1: 1.85, X: 3.6, 2: 4.2 },
    });

    const bet = betService.placeBet({
      userId: 'user_alice',
      matchId: match.id,
      selection: '1',
      stake: 100,
    });

    assert.equal(bet.lockedOdds, 1.85);
    assert.equal(bet.potentialReturn, 185);
    assert.equal(bet.potentialProfit, 85);
  });

  it('2. Throws ConflictError (409) when user places a duplicate bet on the same match', () => {
    const matchRepo = new MatchRepository();
    const betRepo = new BetRepository();
    const config = { lockMinutesBeforeKickoff: 15, maxStake: 250 };
    const matchService = new MatchService(matchRepo, silentLogger);
    const betService = new BetService(betRepo, matchRepo, config, silentLogger);

    const kickoff = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const match = matchService.createMatch({
      homeTeam: 'Real Madrid',
      awayTeam: 'Barcelona',
      kickoffTime: kickoff,
      odds: { 1: 2.1, X: 3.4, 2: 3.2 },
    });

    betService.placeBet({ userId: 'user_bob', matchId: match.id, selection: '1', stake: 50 });

    assert.throws(
      () => betService.placeBet({ userId: 'user_bob', matchId: match.id, selection: '2', stake: 50 }),
      ConflictError
    );
  });

  it('3. Throws ConflictError (409) when betting inside the pre-kickoff lock window', () => {
    const matchRepo = new MatchRepository();
    const betRepo = new BetRepository();
    const config = { lockMinutesBeforeKickoff: 15, maxStake: 250 };
    const matchService = new MatchService(matchRepo, silentLogger);
    const betService = new BetService(betRepo, matchRepo, config, silentLogger);

    // Kickoff is only 5 minutes away (inside the 15-minute lock cutoff)
    const kickoff = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const match = matchService.createMatch({
      homeTeam: 'Liverpool',
      awayTeam: 'Chelsea',
      kickoffTime: kickoff,
      odds: { 1: 1.75, X: 3.8, 2: 4.5 },
    });

    assert.throws(
      () => betService.placeBet({ userId: 'user_charlie', matchId: match.id, selection: 'X', stake: 50 }),
      ConflictError
    );
  });
});

describe('Integration Tests: HTTP API & RFC 9457 Responses', () => {
  it('4. Creates a match (201 + Location header) and retrieves it (200)', async () => {
    const app = createApp();
    const server = app.listen(0);
    const baseUrl = `http://localhost:${server.address().port}`;

    try {
      const kickoff = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const createRes = await fetch(`${baseUrl}/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTeam: 'Bayern Munich',
          awayTeam: 'Dortmund',
          kickoffTime: kickoff,
          odds: { 1: 1.6, X: 4.1, 2: 5.0 },
        }),
      });

      assert.equal(createRes.status, 201);
      assert.equal(createRes.headers.get('location'), '/matches/1');
      assert.ok(createRes.headers.get('x-request-id'));

      const getRes = await fetch(`${baseUrl}/matches/1`);
      assert.equal(getRes.status, 200);
      const data = await getRes.json();
      assert.equal(data.homeTeam, 'Bayern Munich');
    } finally {
      server.close();
    }
  });

  it('5. Returns 422 RFC 9457 Problem Details for invalid bet input', async () => {
    const app = createApp();
    const server = app.listen(0);
    const baseUrl = `http://localhost:${server.address().port}`;

    try {
      const res = await fetch(`${baseUrl}/bets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: '',
          matchId: 1,
          selection: 'INVALID',
          stake: -20,
        }),
      });

      assert.equal(res.status, 422);
      assert.match(res.headers.get('content-type'), /application\/problem\+json/);
      const body = await res.json();
      assert.equal(body.status, 422);
      assert.ok(body.requestId);
      assert.ok(body.errors.stake);
      assert.ok(body.errors.selection);
    } finally {
      server.close();
    }
  });

  it('6. Returns 404 RFC 9457 Problem Details when placing a bet on a non-existent match', async () => {
    const app = createApp();
    const server = app.listen(0);
    const baseUrl = `http://localhost:${server.address().port}`;

    try {
      const res = await fetch(`${baseUrl}/bets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user_1',
          matchId: 999,
          selection: '1',
          stake: 50,
        }),
      });

      assert.equal(res.status, 404);
      const body = await res.json();
      assert.equal(body.type, '/problems/not-found');
    } finally {
      server.close();
    }
  });
});

