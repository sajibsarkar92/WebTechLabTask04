import { Router } from "express";
import { z } from 'zod';
import { ValidationError } from "../errors.js";

const oddsSchema = z.strictObject({
    1: z.number().gt(1, "Odds for selection 1 must be greater than 1"),
    X: z.number().gt(1, "Odds for selection X must be greater than 1"),
    2: z.number().gt(1, "Odds for selection 2 must be greater than 1"),
});

const createMatchSchema = z.object({
    homeTeam: z.string().trim().min(1, "Home team is required"),
    awayTeam: z.string().trim().min(1, "Away team is required"),
    kickoffTime: z.iso.datetime({ offset: true, message: "Valid ISO datetime is required" }),
    odds: oddsSchema,
});

const updateMatchSchema = z.strictObject({
    odds: oddsSchema.optional(),
    status: z.enum(['OPEN', 'CLOSED', 'CANCELLED'], {
        error: 'status must be one of OPEN, CLOSED, or CANCELLED',
    }).optional(),
}).refine((data) => data.odds !== undefined || data.status !== undefined, {
    message: 'At least one of odds or status must be provided',
});

export function createMatchRouter(matchService) {

    const router = Router();

    router.post('/', (req,res) =>{
        const parsed = createMatchSchema.safeParse(req.body);

        if(!parsed.success){
            throw new ValidationError(z.flattenError(parsed.error).fieldErrors);
        }

        const match = matchService.createMatch(parsed.data);
        res.status(201).location(`/matches/${match.id}`).json(match);
    });

    router.get('/',(req,res) =>{
        res.json(matchService.listMatches());
    })

    router.get('/:id', (req,res) =>{
        const match = matchService.getMatchById(req.params.id);
        res.json(match);
    });

    router.patch('/:id', (req, res) => {
        const parsed = updateMatchSchema.safeParse(req.body);

        if (!parsed.success) {
            const flat = z.flattenError(parsed.error);
            const errors = flat.formErrors.length > 0
                ? { ...flat.fieldErrors, _form: flat.formErrors }
                : flat.fieldErrors;
            throw new ValidationError(errors);
        }

        const updated = matchService.updateMatch(req.params.id, parsed.data);
        res.json(updated);
    });

    router.delete('/:id', (req, res) => {
        matchService.deleteMatch(req.params.id);
        res.status(204).send();
    });

    return router;

}