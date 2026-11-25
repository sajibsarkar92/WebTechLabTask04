import { Bet } from '../domains/bet.js';
import { ConflictError, NotFoundError } from '../errors.js';

export class BetService{
    constructor(betRepo, matchRepo,config, logger= console){
        this.betRepo = betRepo;
        this.matchRepo = matchRepo;
        this.config = config;
        this.logger = logger;
    }

    placeBet({userId, matchId, selection, stake}, now = new Date()){
        const match = this.matchRepo.getById(matchId);
        if (!match) {
            throw new NotFoundError('Match not found');
        }

        match.ensureBettable(now,this.config.lockMinutesBeforeKickoff);

        if (stake > this.config.maxStake) {
            throw new ConflictError(`Stake $${stake} exceeds maximum allowed of $${this.config.maxStake}`);
        }
        const existingBet = this.betRepo.findByUserAndMatch(userId, matchId);
        if (existingBet) {
            throw new ConflictError(`User ${userId} has already placed a bet on this match ${matchId}`);
        }

        const lockedOdds = match.getOddsForSelection(selection);
        const bet = new Bet({userId, matchId: match.id, selection, stake, lockedOdds, createdAt: now});

        const saved = this.betRepo.add(bet);
        this.logger.info(`Bet placed successfully: ${saved.id}`);
        return saved;
    }

    getBetById(id){
        const bet = this.betRepo.getById(id);
        if (!bet) {
            throw new NotFoundError('Bet not found');
        }
        return bet; 
    }

    listBets(){
        return this.betRepo.listAll();
    }
}