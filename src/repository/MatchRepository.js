export class MatchRepository {
    constructor(){
        this._rows = new Map();
        this._nextId = 1;
    }

    add(match) {
        match.id = this._nextId++;
        this._rows.set(match.id, match);   
        return match;
    }

    getById(id){
        return this._rows.get(Number(id))?? null;
    }

    listAll() {
        return Array.from(this._rows.values());
    }

    deleteById(id) {
        return this._rows.delete(Number(id));
    }
}