import 'dotenv/config';

export function loadConfig(overrides = {}) {
  return {
    port: Number(overrides.port ?? process.env.PORT ?? 3000),
    lockMinutesBeforeKickoff: Number(
      overrides.lockMinutesBeforeKickoff ?? process.env.LOCK_MINUTES_BEFORE_KICKOFF ?? 15
    ),
    maxStake: Number(overrides.maxStake ?? process.env.MAX_STAKE ?? 250),
  };
}