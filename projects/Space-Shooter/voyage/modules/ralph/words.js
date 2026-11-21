// Ralph's plain words. One short line, derived from what he is doing right now (model.sayKey), so it is never stale.
// A host may override any of them through context.lines.
export const WORDS = {
  'mode-idle': 'Ralph watches you.', 'mode-wander': 'Ralph pads about.', 'mode-sleep': 'Ralph is asleep. Rub him gently, or leave him.', 'mode-wake': 'Ralph stretches.',
  'mode-glance': 'Ralph looks up from his bed.', 'mode-runto': 'Ralph is coming!', 'mode-frenzy': 'Ralph has missed you!', 'mode-lean': 'Ralph leans on your leg.',
  'mode-come': 'Ralph comes over.', 'mode-chase': 'Ralph is after it!', 'mode-bring': 'Ralph is bringing it back.', 'mode-present': 'Ralph shows you.',
  'mode-dropwalk': 'Ralph is bringing it back.', 'mode-wait': 'Ralph dropped it. He is looking at you.', 'mode-keepgo': 'Ralph has other plans.', 'mode-keep': 'Ralph has it. Tap him to ask for it.',
  'mode-findgo': 'Ralph has gone to the scrap pile.', 'mode-dig': 'Ralph is digging.', 'mode-findback': 'Ralph is back, and very proud.', 'mode-showoff': 'Ralph found something!',
  'mode-eatgo': 'Ralph smells dinner.', 'mode-eat': 'Ralph eats.', 'mode-search': 'Ralph looks for his ball.', 'mode-bonetake': 'Ralph takes it, gently.', 'mode-bonego': 'Ralph carries it to his bed.',
  'mode-chew': 'Ralph is busy with the bone.', 'mode-away': 'Ralph needs a minute.',
  aiming: 'Pull back, and let go.', bowing: 'Ralph is ready.', rubbing: 'Rub him slowly. Find his favourite spot.', warm: 'Warmer. Keep rubbing there.',
  draggingBone: 'Bring it to Ralph.', draggingKibble: 'Fill his bowl.',
  likes: 'He likes that one.', loves: 'He loves that one!', nowhere: 'Ralph gives you a look.', pullback: 'Press the ball, pull back, let go.',
  chasing: 'Go!', brought: 'Good dog.', dropped: 'He dropped it halfway.', kept: 'He kept it. Tap him to ask for it.', gaveup: 'Fine. Here.', boredkeep: 'He got bored of it.', scrapped: 'He saw something better.',
  spot: 'That is the spot!', enough: 'Enough! He shakes it off.', bond: 'Ralph trusts you a little more.', woke: 'He is awake.',
  coming: 'Ralph comes.', notnow: 'Ralph is thinking about it.', busy: 'Ralph does not look up.', sleepsthrough: 'One ear twitches. Still asleep.',
  bone: 'A bone!', havebone: 'He already has one.', nobone: 'No bone to give.', closer: 'Take it right to him.',
  kibble: 'Dinner.', nokibble: 'No kibble left.', bowlfar: 'Put it in the bowl.', bowlfull: 'The bowl is full.', ate: 'All gone.', ballwhere: 'Where is the ball?',
  fetchtray: 'Drag it to Ralph.', quick: 'One throw. One rub.',
};
export const FOUND = (name) => `He brought you ${name}!`;
