import { Match } from '../domains/match.js';
import { ConflictError, NotFoundError } from '../errors.js';

export class MatchService{
    constructor(matchRepo, logger = console, betRepo = null){
        this.matchRepo = matchRepo;
        this.logger = logger;
        this.betRepo = betRepo;
    }

    createMatch({homeTeam, awayTeam, kickoffTime, odds}){
        const match = new Match({homeTeam, awayTeam, kickoffTime, odds});
        const saved = this.matchRepo.add(match);
        this.logger.info(`Match created id=${saved.id}, fixture: ${saved.homeTeam} vs ${saved.awayTeam}`);
        return saved;
    }


    getMatchById(id){
        const match = this.matchRepo.getById(id);
        if (!match) {
            throw new NotFoundError('Match not found');
        }
        return match;
    }

    listMatches(){
        return this.matchRepo.listAll();
    }

    updateMatch(id, { odds, status }){
        const match = this.getMatchById(id);
        match.update({ odds, status });
        this.logger.info(`Match updated id=${match.id}, status=${match.status}`);
        return match;
    }

    deleteMatch(id){
        const match = this.getMatchById(id);
        if (this.betRepo && this.betRepo.existsByMatchId(match.id)) {
            throw new ConflictError(`Match ${match.id} cannot be deleted because bets have already been placed on it.`);
        }
        this.matchRepo.deleteById(match.id);
        this.logger.info(`Match deleted id=${match.id}`);
    }
}