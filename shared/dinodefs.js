// Dino species definitions (Stage 2). Adding a species = adding an entry here
// plus a sprite painter on the client.

export const DINODEFS = {
  dodo: {
    name: 'Dodo',
    w: 52, h: 44,
    hp: 40,
    speed: 55,
    fleeSpeed: 130,
    drops: { raw_meat: [2, 3], hide: [1, 2] },
    tameFood: 'berry',          // item fed to tame
    tameFeeds: 8,               // feeds required
    feedCooldownS: 8,           // dodo digests between feeds
    eggIntervalS: [180, 300],   // tamed dodos lay an egg this often
  },
};
