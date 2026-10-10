/** The guide's words in English. The same {placeholders} as the Korean file; no digit is typed here. */
export const EN: Record<string, string> = {
  // ── pieces of the screens ──
  'guide.title': 'Guidebook',
  'guide.section.start': 'Basics',
  'guide.section.team': 'Team',
  'guide.section.field': 'Field',
  'guide.section.foes': 'Foes',
  'guide.section.home': 'Home',
  'guide.sectionLong.start': 'Getting started',
  'guide.sectionLong.team': 'Your team',
  'guide.sectionLong.field': 'Battlefield rules',
  'guide.sectionLong.foes': 'Enemies',
  'guide.sectionLong.home': 'At home',
  'guide.new': 'NEW',
  'guide.count': '{n}/{total}',
  'guide.unread': '{n} unread',
  'guide.allRead': 'All read!',
  'guide.try.battle': 'Try it',
  'guide.try.home': 'Go there',
  'guide.next': 'Next',
  'guide.prev': 'Previous',
  'guide.close': 'Close',
  'guide.list': 'All topics',
  'guide.settings.title': 'Guidebook',
  'guide.settings.hint': 'Read the rules any time',
  'guide.replay.row': 'Play the tutorial again',
  'guide.replay.title': 'Play the tutorial again?',
  'guide.replay.body': 'This clears what you were taught and walks you through it from the start. Pages you have read stay marked.',
  'guide.replay.yes': 'Play again',
  'guide.replay.no': 'Cancel',
  'guide.replay.busy': 'A run is in progress. Finish it first.',
  'guide.pause': 'Guidebook',
  'guide.card.got': 'Got it',
  'guide.card.more': 'More in the guidebook',
  'guide.ok': 'Got it',
  'guide.skip': 'Skip',
  'guide.skip.title': 'Skip the tutorial?',
  'guide.skip.body': 'The lessons stop and the run goes on as an easy one. Read anything you missed in the guidebook in Settings.',
  'guide.skip.yes': 'Skip',
  'guide.skip.no': 'Keep going',
  'guide.skip.note': 'The guidebook is in Settings, and in the pause menu.',
  'guide.skip.start': 'Tap Summon to begin!',
  'guide.end.title': 'Tutorial done!',
  'guide.end.body': 'Stuck later? Open the guidebook in Settings.',
  'guide.end.open': 'Open guidebook',
  'guide.end.go': 'See results',
  'guide.tut.count': '({n}/{total})',
  'guide.tut.sheet': 'Your ranks and synergy steps are here. Close it when you are done.',
  'guide.tut.pickRec': 'The card with tape is the pick we suggest.',
  'guide.cheer.0': 'Nice!',
  'guide.cheer.1': 'Well done!',
  'guide.cheer.2': 'Purr-fect!',
  'guide.cheer.3': 'Great!',

  // ── Basics ──
  'guide.summon.title': 'Fish and summoning',
  'guide.summon.teach': 'Spend fish to call a cat. Tap it!',
  'guide.summon.full':
    'Tap Summon to pay fish and get a random cat. A run starts with {start} fish.\nThe first summon costs {first} fish, every summon after it costs {step} more, up to {cap}. Hold the button to keep summoning.\nFish come from defeating enemies and clearing waves, and while a wave runs {rate} more arrive every second by themselves. When the board is full you cannot summon, so merge or sell.',

  'guide.summon_grade.title': 'Summon grade and odds',
  'guide.summon_grade.teach': 'Tap to raise the grade: better cats show up more.',
  'guide.summon_grade.full':
    'Raising the summon grade makes rarer cats more likely for the same price. There are {top} grades and each step costs fish: {costs}.\nThe first grade rolls {odds1}. The top grade rolls {oddsTop}.\nTap the round % button to see the real odds of your next summon.',

  'guide.pity.title': 'Pity (bonus odds)',
  'guide.pity.teach': 'After a dry spell your odds creep up.',
  'guide.pity.full':
    'If {limit} summons in a row give nothing better than a Street cat, every summon after that adds {step}% to the chance of an Alley Boss or better, up to {max}%.\nThe count starts over when a good cat shows up. While the bonus builds, a yellow chip shows how far along it is.',

  'guide.merge.title': 'Merging',
  'guide.merge.teach': 'Drag a cat onto its twin: next rank!',
  'guide.merge.full':
    'Drag one cat onto an identical one and they become a single cat of the next rank in the same class. For example two {a} become {b}.\nThe ranks go Kitten, Street, Alley Boss, King. Kings do not merge, they awaken.\nWhile you drag, cats you can merge with are marked and a bubble shows what you would get.',

  'guide.class_lines.title': 'Class lines',
  'guide.class_lines.teach': 'Every class has a fixed line of ranks.',
  'guide.class_lines.full':
    'Merging always moves along the same class line.\nWarrior: {warrior}\nRanger: {ranger}\nMage: {mage}\nTrickster: {trickster}\nThe last step, the Guardian, is never merged: awaken a King. To change lines, use molting.',

  'guide.acts.title': 'Stages and waves',
  'guide.acts.teach': '{actLen} waves make a stage. Each stage ends with rewards.',
  'guide.acts.full':
    'Enemies arrive wave by wave. {actLen} waves make a stage, and a chapter is {acts} stages, {waves} waves.\nWhen a stage ends you get fish and purr and choose a toy. The special tiles move to new places.\nThe small cards at the top show the next wave. Tap one to learn about that enemy.',

  'guide.lose_gauge.title': 'Losing: too many enemies',
  'guide.lose_gauge.teach': 'If this bar stays full you lose. Thin them out!',
  'guide.lose_gauge.full':
    'The bar at the top counts the enemies on the path. Above {cap} an "Overrun!" countdown starts.\nIf you cannot get under the limit before {grace} seconds run out, you lose. Getting under it stops the countdown.\nThe bar turns yellow at {caution} and red at {alarm}. When it is red, sweep the weak ones or use the laser.',

  'guide.lose_boss.title': 'Losing: the boss timer',
  'guide.lose_boss.teach': 'Beat elites and bosses before their time runs out.',
  'guide.lose_boss.full':
    'Elite and boss waves have a time limit. The bar at the top is that clock.\nElites give you {elite} seconds in turn, bosses {boss}. When it runs out you lose, however little is left of them.\nThe "estimate" on the boss bar tells you if you can make it. If not, build synergies and use the laser.',

  'guide.continue.title': 'Continuing',
  'guide.continue.teach': 'You can carry on once after a defeat.',
  'guide.continue.full':
    'If you lose after clearing {minWave} waves you are offered one continue: watch an ad or pay {gems} gems.\nAfter an overrun the enemies drop to {cap}% of the limit and you get a moment of safety. After a boss timeout the boss loses {hp}% health and you get {time} more seconds.\nOnce per run, and not in the daily challenge.',

  // ── Your team ──
  'guide.classes.title': 'The four classes',
  'guide.classes.teach': 'Tap a class chip. Each class does a different job.',
  'guide.classes.full':
    '{warrior}: {warriorRole}\n{ranger}: {rangerRole}\n{mage}: {mageRole}\n{trickster}: {tricksterRole}\nThe class chips at the bottom show the ranks you own and your synergy step.',

  'guide.synergy.title': 'Synergy',
  'guide.synergy.teach': 'More kinds of one class, more power. The {kitten} rank does not count.',
  'guide.synergy.full':
    'When {a}, {b} or {c} different cats of one class stand on the board, synergy turns on step by step. The {kitten} rank does not count and several copies of the same cat are one kind, so the last step needs the {guardian} too.\nThe damage bonus goes to the cats of that class only; side effects such as armour ignore, crit and status duration go to every cat.\nWarrior: {warrior}\nRanger: {ranger}\nMage: {mage}\nTrickster: {trickster}\n(Each line gives the bonus of the first, second and third step.)\nAt {c} kinds every class also gets an ability.\n{warriorAbility}\n{rangerAbility}\n{mageAbility}\n{tricksterAbility}',

  'guide.class_sheet.title': 'The class sheet',
  'guide.class_sheet.teach': 'Tap a class chip to see everything about it.',
  'guide.class_sheet.full':
    'Tap a class chip to open its line. Ranks you own are lit photos, missing ones are dashed slots. The small dots on the chip are the ranks that count toward synergy, so the dot of the {kitten} rank never lights.\nAn arrow takes the class colour when a merge or an awakening is possible.\nBelow it you see how many kinds are missing for the next synergy step, the bonus of each step (from {a} kinds up to {c}) and the ability that turns on at {c} kinds.',

  'guide.class_upgrade.title': 'Class upgrade',
  'guide.class_upgrade.teach': 'Tap a class chip to upgrade the whole class.',
  'guide.class_upgrade.full':
    'The upgrade button on the class sheet raises the damage of every cat of that class by {bonus}% per step.\nYou can upgrade {max} times and the steps cost {costs} fish in turn. It pays off when you have collected many cats of that class.',

  'guide.pick3.title': 'Pick one of three',
  'guide.pick3.teach': 'Every {every} summons, pick one of three cats.',
  'guide.pick3.full':
    'Every {every} summons you see {options} cats and keep one. Kittens never appear here.\nUnder each card it says what the cat merges into. A new kind of a class you already own brings you closer to synergy.\nThe paw marks under the board show how far away the next pick is.',

  'guide.purr.title': 'Purr',
  'guide.purr.teach': 'Purr is the rare material for molting and awakening.',
  'guide.purr.full':
    'Purr is the happy sound of your cats, collected. You spend it on molting and awakening.\nAn elite pays {elite}, a boss {boss}, and each cleared stage {act}. Selling an Alley Boss or better returns some too.\nMolting costs a different amount for each rank ({molt}); awakening costs {awaken}.',

  'guide.molt.title': 'Molting',
  'guide.molt.teach': 'Tap a cat, then molt it into another class.',
  'guide.molt.full':
    'Tap a cat, press Molt and choose a class. The rank stays, the class changes.\nPurr cost grows with the rank of the cat ({prices}). It works {limit} times per run, and a guardian cannot molt. Use it when a pair is one cat short, or a synergy is one kind short.',

  'guide.awaken.title': 'Awakening and Guardians',
  'guide.awaken.teach': 'A King that gathers purr becomes a Guardian.',
  'guide.awaken.full':
    'Kings cannot merge further. With the class synergy at step {tier} ({kinds} kinds) or better, pay {cost} purr and the King awakens into the Guardian of its class.\nGuardians are the strongest cats. Tap a King to see the two conditions, each gets a check when it is met.',

  'guide.sell.title': 'Selling',
  'guide.sell.teach': 'Tap a cat and sell it for fish and room.',
  'guide.sell.full':
    'Tap a cat and press Sell, or drag it onto the sell strip, to get fish back.\nKitten {f1} · Street {f2} · Alley Boss {f3} · King {f4} · Guardian {f5} fish. From Alley Boss up you also get purr: {purr} in that order.\nWhen the board is full, selling a weak cat makes room for a new one.',

  'guide.move_swap.title': 'Moving and swapping',
  'guide.move_swap.teach': 'Drag a cat to an empty cell, or onto another to swap.',
  'guide.move_swap.full':
    'Drag a cat onto an empty cell to move it. Drop it on a different cat to swap places, or on an identical one to merge.\nYou can also tap a cat to pick it and then tap the cell. Moving your best cats to sunny cells and the outer ring pays off.',

  // ── Battlefield ──
  'guide.sun.title': 'Special tiles',
  'guide.sun.teach': 'Drag a cat onto the {cell} to get its bonus!',
  'guide.sun.full':
    'Every chapter has its own special tile, {cells} of them on the board. A cat standing on one gets its bonus.\n{kinds}\nThe special tiles move to new places whenever a stage ends, so move your strong cats in. Tap an empty special tile to see what it does; a cat standing on one wears the tile\'s badge.',

  'guide.hazards.title': 'Cell hazards',
  'guide.hazards.teach': 'Cats on a soaked or zapped cell cannot attack.',
  'guide.hazards.full':
    'Some enemies and bosses soak cells with water or strike them with lightning. A cat there cannot attack until it ends.\nWater lasts {wet} seconds, lightning {zap}. The cell flashes {warn} seconds before, so move your cat to another cell in time.\nA bell cat and the cats right around it sometimes dodge them.',

  'guide.laser.title': 'Laser pointer',
  'guide.laser.teach': 'Drop a dot: cats hit nearby enemies first. It sticks to bosses.',
  'guide.laser.full':
    'Press the laser button, then tap the path to drop a red dot. For {dur} seconds your cats attack the enemy closest to it first, and an elite or a boss inside the dot comes before any other.\nDrop the dot near an elite or a boss and it snaps onto that enemy and follows it as it walks: a red ring closes round it and every cat that can reach it attacks it first. Move the dot elsewhere to let go.\nMarked enemies near the dot take {vuln}% more damage. It is ready again {cd} seconds after use.\nUse it on bosses and dangerous enemies. The i mark beside the button reopens the full explanation.',

  'guide.call_wave.title': 'Calling the next wave',
  'guide.call_wave.teach': 'Call the next wave early for bonus fish. Tap it!',
  'guide.call_wave.full':
    'After all enemies of a wave have appeared, a green button shows up. Tap it to skip the rest of the timer and start the next wave now.\nYou get a fish bonus that grows with the time you skip, {rate} per second up to {max}. If many enemies are still alive, it is safer not to.',

  'guide.speed.title': 'Game speed',
  'guide.speed.teach': 'Each tap makes the game faster. Try it!',
  'guide.speed.full':
    'The button at the top right changes the speed. Each tap switches between normal and x{fast}. x{faster} is unlocked with the Butler Pass.\nOn hard waves go back to normal speed and play it calmly.',

  'guide.preview.title': 'Next wave preview',
  'guide.preview.teach': 'The cards at the top show who comes next. Tap one.',
  'guide.preview.full':
    'The small cards in the top row are the enemies of the next wave. The ×number is how many, and a red card is an elite or a boss.\nTap a card to read what that enemy can do. Plan which class you will need.',

  'guide.toys.title': 'Toys',
  'guide.toys.teach': 'Pick a toy. It helps for the whole run.',
  'guide.toys.full':
    'After every stage {options} toys appear and you keep one. Your toys gather in the top row and help for the rest of the run.\nToys have ranks like cats. Early stages offer {early}, the middle stages {mid}, the late stages {late}.\nOne of them usually answers the enemies of the next stage. Tap a toy in the top row to read its effect again.',

  'guide.toy_reroll.title': 'Toy reroll',
  'guide.toy_reroll.teach': 'Not happy with the toys? Roll them again.',
  'guide.toy_reroll.full':
    'The reroll button on the toy screen swaps the offer for different toys. You get {free} free reroll per run.\nAfter that you can reroll once more by watching an ad or paying {gems} gems.',

  'guide.stakes.title': 'Butler levels',
  'guide.stakes.teach': 'Clear a chapter to unlock a harder level.',
  'guide.stakes.full':
    'Clearing a chapter unlocks the next butler level. Each level adds a rule on top of the lower ones (the top is level {max}) and raises rewards by {reward}% per level.\nFirst: {s1} {c1}\nSecond: {s2} {c2}\nThird: {s3} {c3}\nFourth: {s4} {c4}\nFifth: {s5} {c5}\nEvery level includes the rules of the lower ones. Only how well elites and bosses resist control is replaced by that level\'s numbers.',

  // ── Enemies ──
  'guide.elite.title': 'Elites',
  'guide.elite.teach': 'Elites are tough. Beat them before the timer ends!',
  'guide.elite.full':
    'The first elite comes in wave {first}, then one every {gap} waves, walking with a few small escorts.\nYou must beat it in time (the first one gives you {time} seconds). Defeating it pays {fish} fish and {purr} purr.\nKing Cucumber gets angry below half health and speeds up by as much as {rage}%.',

  'guide.boss.title': 'Bosses',
  'guide.boss.teach': 'A boss! Beat it before the timer runs out.',
  'guide.boss.full':
    'The first boss comes in wave {first}, then one every {gap} waves. Each chapter has a boss with its own trick.\nThe time limit starts at {time} seconds. Defeating a boss pays {fish} fish and {purr} purr.\nWhen a boss appears a banner names it and its trick. The boss bar shows the time left and an estimate.',

  'guide.boss_vacuum.title': 'Boss: {name}',
  'guide.boss_vacuum.teach': '{name} inhales and weakens your cats.',
  'guide.boss_vacuum.full':
    'Every {every} seconds it inhales for {dur} seconds. Your cats attack slower and the boss takes {taken}% less damage.\nDo not waste effort while it inhales. Save your strength and strike hard when it ends.',

  'guide.boss_blender.title': 'Boss: {name}',
  'guide.boss_blender.teach': '{name} speeds up every enemy at once.',
  'guide.boss_blender.full':
    'Every {every} seconds it whips up a whirl for {dur} seconds and every enemy on the path moves {speed}% faster.\nThe enemies rush in together then. Slowing magic and wide attacks hold the line.',

  'guide.boss_bath.title': 'Boss: {name}',
  'guide.boss_bath.teach': '{name} floods your cells.',
  'guide.boss_bath.full':
    'Every {every} seconds it sends out {count} water drops, and every {soak} seconds it soaks {cells} cells for {dur} seconds. Cats on a soaked cell cannot attack.\nA flashing cell is about to be soaked. Move important cats out in time.',

  'guide.boss_cloud.title': 'Boss: {name}',
  'guide.boss_cloud.teach': '{name} blocks cells with lightning.',
  'guide.boss_cloud.full':
    'Every {every} seconds it strikes a block of four cells. Cats on them cannot attack for {dur} seconds.\nThe strike area flashes first. Step your strongest cats aside.',

  'guide.boss_needle.title': 'Boss: {name}',
  'guide.boss_needle.teach': '{name} shrugs off slows and heals itself.',
  'guide.boss_needle.full':
    'Every {every} seconds, for {dur} seconds, enemies ignore slowing effects and the boss heals {heal}% of its health per second.\nSlows are useless then. Hit it with strong single blows or the laser.',

  'guide.trait_armored.title': '{name} enemies',
  'guide.trait_armored.teach': 'They take less physical damage. Magic works well.',
  'guide.trait_armored.full':
    'A hard shell cuts physical damage by {armor}%. They are slow and sturdy.\nMage cats work best. Armour break and armour ignore (warrior synergy) work too.',

  'guide.trait_warded.title': '{name} enemies',
  'guide.trait_warded.teach': 'They take less magic damage. Use warriors and rangers.',
  'guide.trait_warded.full':
    'A ward cuts magic damage by {ward}%.\nPhysical hits from warriors and rangers go through just fine. Armour break and armour ignore cut the ward as well.',

  'guide.trait_fast.title': '{name} enemies',
  'guide.trait_fast.teach': 'They run much faster than the rest.',
  'guide.trait_fast.full':
    'They move at {speed}, normal enemies at {normal}. They are frail but reach the end quickly.\nSlowing attacks and cats with long range help. Some enemies shrug off part of a slow, and the codex shows how much.',

  'guide.trait_swarm.title': '{name} enemies',
  'guide.trait_swarm.teach': 'Weak, but they arrive in crowds.',
  'guide.trait_swarm.full':
    'Small enemies with only {hp}% of normal health arrive all at once. They fill the enemy bar fast, so watch it.\nWide attacks that hit several at once are best.',

  'guide.trait_split.title': '{name} enemies',
  'guide.trait_split.teach': 'When defeated they split into smaller ones.',
  'guide.trait_split.full':
    'When defeated they split into {count} small enemies, which you still have to clear.\nAfter the split there are more of them, so wide attacks are best.',

  'guide.trait_haste_aura.title': '{name} enemies',
  'guide.trait_haste_aura.teach': 'They speed up nearby enemies. Defeat them first.',
  'guide.trait_haste_aura.full':
    'Enemies close to it move {haste}% faster. In a crowd that is everyone.\nMark it with the laser and take it down first.',

  'guide.trait_heal_aura.title': '{name} enemies',
  'guide.trait_heal_aura.teach': 'They heal nearby enemies. Defeat them first.',
  'guide.trait_heal_aura.full':
    'Enemies close to it recover {heal}% of their health per second and shrug off slowing.\nIf you do not take it down first, the others hardly ever drop.',

  'guide.trait_shield.title': '{name} enemies',
  'guide.trait_shield.teach': 'A shield takes the hits for them.',
  'guide.trait_shield.full':
    'They carry a shield worth {shield}% of their health that takes damage first. Only when it breaks does the body get hurt.\nStrong single hits work best.',

  'guide.trait_weaken.title': '{name} enemies',
  'guide.trait_weaken.teach': 'They slow down your strongest cat.',
  'guide.trait_weaken.full':
    'Every {every} seconds they halve the attack speed of your strongest cat for {dur} seconds.\nDo not rely on one cat. Spread the power over several.',

  // ── At home ──
  'guide.cards.title': 'Cat cards and levels',
  'guide.cards.teach': 'Collect cards to make a cat stronger.',
  'guide.cards.full':
    'Collecting cat cards raises a cat\'s level. Each level adds {dmg}% damage, up to level {max}.\nLevelling costs cards and gold. The first level needs {first} cards, the last {last}, and rarer cats need fewer.\nOpen the Cats tab and tap the cat you want to grow.',

  'guide.wild_cards.title': 'Wild cards',
  'guide.wild_cards.teach': 'A card that works for any cat of its rank.',
  'guide.wild_cards.full':
    'A wild card can be used on any cat of the same rank. {share}% of the cards from chests are wild.\nUse them to fill the cards you are missing when you level a cat you want.',

  'guide.chests.title': 'Chests and odds',
  'guide.chests.teach': 'Chests give cat cards. All odds are public.',
  'guide.chests.full':
    'A wooden chest holds {woodCards} cards, a silver one {silverCards} and a gold one {goldCards}.\nOdds per card, wooden: {wood}\nSilver: {silver}\nGold: {gold}\nA silver chest always holds at least {silverGuarantee} Alley Boss or better, a gold one at least {goldGuarantee} Kings.\nOnce in every {every} gold chests, a chest adds {bonus} extra cards of your lowest-level King (pity). Tap the % button on a chest to check any time. A silver chest costs {silverGems} gems, a gold one {goldGems}.',

  'guide.free_chest.title': 'Free chest',
  'guide.free_chest.teach': 'A free chest piles up as time passes.',
  'guide.free_chest.full':
    'A free wooden chest piles up every {hours} hours. Collect it in the shop.\nIf you do not want to wait, watch an ad or pay {skip} gems to open it now.',

  'guide.missions.title': 'Missions',
  'guide.missions.teach': 'Fill missions for gold and chest points.',
  'guide.missions.full':
    'There are {daily} daily and {weekly} weekly missions. They fill up as you play, merge and beat bosses. For example, playing {runs} runs in a day pays out.\nDaily missions give points, and enough points open the daily chest.',

  'guide.daily_chest.title': 'The daily chest',
  'guide.daily_chest.teach': 'Mission points open today\'s chest.',
  'guide.daily_chest.full':
    'Each daily mission gives points. Collect {points} for a silver chest and {gems} gems.\nThe points start over the next day.',

  'guide.calendar.title': 'Attendance calendar',
  'guide.calendar.teach': 'Visit every day for a gift from the calendar.',
  'guide.calendar.full':
    'A calendar of {days} days. Each day you visit, you collect the next gift.\nGold chests wait on days {gold}, and a rug skin on the last day. Collect them from the calendar on the home screen.',

  'guide.pass.title': 'Season pass',
  'guide.pass.teach': 'Earn XP to climb the tiers and collect rewards.',
  'guide.pass.full':
    'A season lasts {days} days and has {tiers} tiers. Every {xp} XP is one tier. Each run you finish adds XP.\nThe free row is for everyone, the premium row gives more gems and chests. It opens after your first run.',

  'guide.patrol.title': 'Patrol',
  'guide.patrol.teach': 'Your cats patrol and bring back gold.',
  'guide.patrol.full':
    'Even when the app is closed your cats patrol and bring back {gold} gold per hour, for up to {cap} hours ({capPass} with the pass).\nYou can collect after {min} minutes. Watch an ad to double what you collect.',

  'guide.sweep.title': 'Sweep',
  'guide.sweep.teach': 'Use tickets to collect rewards from a cleared chapter.',
  'guide.sweep.full':
    'For a chapter you have cleared, spend a sweep ticket to get its rewards without playing. They are {pay}% of what a win pays.\nYou gain {tickets} tickets a day and can keep {stock}.',

  'guide.daily_challenge.title': 'Daily challenge',
  'guide.daily_challenge.teach': 'A new rule set to try every day.',
  'guide.daily_challenge.full':
    'Once a day everyone gets the same run: a short challenge of {waves} waves.\nEvery cat starts at level {level} and the rules are mixed from {rules} variants. It opens after you clear a chapter.\nThe first win pays {chest} silver chest.',

  'guide.weekly_cup.title': 'Weekly cup',
  'guide.weekly_cup.teach': 'Add up the week\'s daily challenges for prizes.',
  'guide.weekly_cup.full':
    'All the waves you reach in a week of daily challenges are added up. Going all the way every day gives the best score, {best}.\nReaching {t1}, {t2} and {t3} points each pays a better chest.',

  'guide.gold_dungeon.title': 'Gold dungeon',
  'guide.gold_dungeon.teach': 'Two short runs a day to collect gold.',
  'guide.gold_dungeon.full':
    'A short run of {waves} waves. There is no boss, and you are paid for every wave you get past and every enemy you defeat.\nHolding out to the end multiplies the gold by {win}, and the first clear of the day pays extra. {free} runs a day are free; one more costs an ad or {gems} gems.\nTiers open as you clear chapters, and a higher tier pays more gold.',

  'guide.endless.title': 'Endless mode',
  'guide.endless.teach': 'See how long you last against endless waves.',
  'guide.endless.full':
    'It opens after you clear chapter {chapter}. The waves never end and enemies get {growth}% tougher every wave.\nReaching wave {w1}, {w2} and {w3} pays rewards.',

  'guide.backup_code.title': 'Meow code (backup)',
  'guide.backup_code.teach': 'One line of text carries your progress to a new device.',
  'guide.backup_code.full':
    'In Settings, make a Meow code and your whole progress becomes one line of text. Write it down, then load it on another device to carry on.\nThe code is not stored on any server. Make a fresh one before you switch devices and never show it to anyone.',
};
