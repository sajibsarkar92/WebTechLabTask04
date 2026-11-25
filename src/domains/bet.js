export class Bet {
  constructor({ id = null, userId, matchId, selection, stake, lockedOdds, createdAt = new Date() }) {
    this.id = id;
    this.userId = userId;
    this.matchId = Number(matchId);
    this.selection = selection; // '1' | 'X' | '2'
    this.stake = Number(stake);
    this.lockedOdds = Number(lockedOdds);
    this.potentialReturn = Number((this.stake * this.lockedOdds).toFixed(2));
    this.potentialProfit = Number((this.potentialReturn - this.stake).toFixed(2));
    this.status = 'PENDING';
    this.createdAt = createdAt;
  }
}