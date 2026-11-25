import { Router } from 'express';
import { z } from 'zod';
import { ValidationError } from '../errors.js';


const placeBetSchema = z.object({
    userId: z.string().trim().min(1, "User ID is required"),
    matchId: z.union([
        z.number().int().positive("Match ID must be a positive integer"),
        z.string().trim().min(1, "Match ID is required"),
    ]),
    selection: z.enum(['1', 'X', '2'],{
        error: 'selection must be one of 1, X, or 2'
    }),
    stake: z.number().positive("Stake must be a positive number")
});

export function createBetRouter(betService) {
    const router = Router();

    router.post('/',(req, res) =>{
        const parsed = placeBetSchema.safeParse(req.body);

        if(!parsed.success) {
            throw new ValidationError(z.flattenError(parsed.error).fieldErrors);

        }

        const bet = betService.placeBet(parsed.data);
        res.status(201).location(`/bets/${bet.id}`).json(bet);

    });

    router.get('/:id', (req, res) => {
        const bet = betService.getBetById(req.params.id);
        res.json(bet);
    });

    router.get('/', (req, res) => {
        const bets = betService.listBets();
        res.json(bets);
    });


    return router;
}