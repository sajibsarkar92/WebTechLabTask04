import {ConflictError} from '../errors.js';

export class Match{
    constructor({id = null, homeTeam, awayTeam, kickoffTime, odds, status = 'OPEN'}) {
        this.id = id;
        this.homeTeam = homeTeam;
        this.awayTeam = awayTeam;
        this.kickoffTime = kickoffTime instanceof Date ? kickoffTime : new Date(kickoffTime);
        this.odds = {
            1: odds['1'],
            X: odds['X'],
            2: odds['2']
        };
        this.status = status;
    }

    ensureBettable(now = new Date(), lockMinutesBeforeKickoff = 15) {
        if (this.status !== 'OPEN') {
            throw new ConflictError(`Match ${this.id} is currently ${this.status} and not open for betting.`);
        }
        const nowDate = now instanceof Date ? now : new Date(now);
        const cutoffMs = this.kickoffTime.getTime() - lockMinutesBeforeKickoff * 60 * 1000;
        if (nowDate.getTime() > cutoffMs) {
            throw new ConflictError(`Match ${this.id} is locked for betting as less than ${lockMinutesBeforeKickoff} minutes before kickoff.`);
        }
    }

    getOddsForSelection(selection) {
        return this.odds[selection];
    }

    update({ odds, status }) {
        if (this.status === 'CLOSED' || this.status === 'CANCELLED') {
            throw new ConflictError(`Match ${this.id} is ${this.status} and cannot be updated.`);
        }
        if (odds !== undefined) {
            this.odds = {
                1: odds['1'],
                X: odds['X'],
                2: odds['2'],
            };
        }
        if (status !== undefined) {
            this.status = status;
        }
    }
}