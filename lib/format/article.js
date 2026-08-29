/**
 * Picks "a" or "an" for a season length read aloud in English.
 *
 * The spoken form decides it, not the digit: 8, 11 and 18 begin with a vowel
 * sound ("an eighteen-week season") while 1, 12 and 19 do not. A season is
 * between 1 and 52 weeks, so those three are the whole list — a general
 * number-to-words rule would be more code for cases this app cannot produce.
 */
const VOWEL_SOUNDED = new Set([8, 11, 18]);

function indefiniteArticleForNumber(value) {
  return VOWEL_SOUNDED.has(Number(value)) ? 'an' : 'a';
}

module.exports = { indefiniteArticleForNumber };
