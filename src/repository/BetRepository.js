export class BetRepository{
    constructor(){
        this._rows = new Map();
        this._nextId = 1;
    }

    add(bet){
        bet.id = this._nextId++;
        this._rows.set(bet.id, bet);
        return bet;
    }

    getById(id){
        return this._rows.get(Number(id))?? null;
    }

    listAll() {
    return Array.from(this._rows.values());
    }

    findByUserAndMatch(userId, matchId) {
        for (const bet of this._rows.values()) {
        if (bet.userId === userId && bet.matchId === Number(matchId)) {
            return bet;
          }
        }
        return null;
    }

    existsByMatchId(matchId) {
        const numericMatchId = Number(matchId);
        for (const bet of this._rows.values()) {
            if (bet.matchId === numericMatchId) {
                return true;
            }
        }
        return false;
    }

}