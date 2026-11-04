# Black Cat HTML5 Experiment Plan

## Objective
Create a single-page HTML5 experience where a black cat moves around a room seen through a fixed-shape view that scrolls with it:
- `ArrowLeft` and `ArrowRight` move horizontally.
- `Space` triggers jump: a tap gives a quick low hop, holding it gives the full jump. `ArrowDown` hops down through a table or shelf, and held on the floor or box it sneaks (slow, low, and animals notice the cat much later).
- Mice carry cheese out of holes in the skirting; a boop on the nose from the cat's forepaw makes them drop it and trot home. Nobody gets hurt: the game is meant to be friendly to rodent fans.
- "Cheese Chase" game loop: title screen, waves, cheese as lives, game over, pause (`P`/`Esc`) and sound toggle (`M`).
- High scores: the top 5 with names, kept in the browser's localStorage and shown on the title and game-over cards.
- Warm, minimal room backdrop (wall, skirting, wooden floor).
- Lamps: a hanging lamp over the table (a pendulum the cat can bump into a swing, with a light cone) and a floor lamp on the open floor (painted into the backdrop).
- Bonus animals that never take cheese: grasshoppers (15), flies (25) and a little bird (40), each dodging the cat its own way.
- From wave 6 a brown dog gallops across the room (more often later). A "Woof!" badge and a bark at the edge it comes from give 1.3s warning; jumping over it scores 50, getting bumped leaves the cat dizzy for a moment and the dog runs off with a piece of cheese. Up on furniture the cat is safe.
- Furniture to climb: a bookcase (cupboard, shelf, top) on the left, a table the cat can walk under or jump onto, and a cardboard box at the right end. The middle of the room is open floor, so the box never stands across the mice's path (a mouse behind the box can't be booped).
- Cat movement should feel natural using inverse-kinematics style articulation for legs, tail, and head.

## Scope and Constraints
- One self-contained page (`index.html`) with inline CSS/JS.
- No external libraries.
- One fixed room size in every window (`ROOM_W` x `ROOM_H`, 1920 x 720), so the difficulty never depends on the window. The view (`VIEW_W` x `VIEW_H`, 1280 x 720, 16:9) is scaled to fit the window at full device resolution and letterboxed by a dark frame.
- Keep visuals minimal: black silhouette cat with yellow-green eyes, warm room, cardboard box.

## Technical Plan
1. Build canvas scene scaffold
- Canvas sized to the largest 16:9 box that fits the window (`fitCanvas`); everything is drawn in room units times `pixelScale`.
- Animation loop with `requestAnimationFrame`.
- Delta-time based updates for smooth motion.

2. Implement movement and collision
- Physics values: horizontal acceleration, friction, gravity, jump impulse.
- Invisible floor baseline within viewport.
- One obstacle box with AABB collision:
  - Horizontal blocking against box sides.
  - Vertical landing on top.
  - Ceiling hit when jumping into underside.

3. Implement cat rig and IK
- Body as a central animated torso with subtle bob/tilt.
- Four legs:
  - Hip anchors attached to body frame.
  - Planted foot targets with step triggers.
  - Two-bone IK solver per leg for knee/elbow placement.
- Tail:
  - Multi-segment chain of angular springs following the rump (see Tail below).
- Head/neck:
  - Two-bone IK from shoulder/neck base to a motion-aware look target.

4. Render and polish
- Draw order: far legs -> tail -> body -> near legs -> neck/head.
- Gait blends walk → trot → gallop with speed (`gaitParams` in `src/cat-motion.js`).
- Keep world intentionally sparse: cat, cardboard box, contact shadow, landing/take-off dust.

## Validation Checklist
- Cat is controllable with keyboard.
- Jump works and supports clearing the box.
- Cat cannot pass through obstacle sides.
- Cat can stand on top of obstacle.
- The view keeps its shape and fills as much of the window as it can after a resize; resizing never changes the room or resets the game.
- Motion includes visible IK-like articulation for legs, tail, and head.

## Current Implementation Status
- `index.html` is the runtime page and uses ES module imports from `src/cat-physics.js`.
- Shared physics helpers are unit-tested in `tests/cat-physics.test.mjs`.
- Hitbox debug overlay is toggled with `H` (`KeyH`) to inspect cat-vs-box collider behavior.
- Spine (`spineMap` in `src/cat-motion.js`, tested): the torso bends and stretches like a real cat's. Rig points (hips, shoulder blades, neck, tail root) and the torso outline are carried along a curve that rounds up or hollows (`pose.arch`) and stretches or bunches (`pose.length`), both springs. It bunches and rounds in the jump crouch, stretches long and lean off the push and through the flight, rounds toward the landing and humps up hard as the hind legs come down after the forepaws; running flexes it a little each stride, a gallop more, sneaking hollows it.
- Fluffy coat, with no visible single hairs: soft locks of fur (`addFurLock`) along the torso outline (long on the chest ruff, belly and britches, short on the back), the throat ruff, cheeks, back of the thighs and the tail. `fillFur` draws each set twice: a blurred fringe (`fillSoft`, which draws the shape off-canvas so only its shadow lands) and shorter crisp locks that keep the outline a little bumpy. Legs get a soft fringe too. The cat is drawn on its own layer (`beginCatLayer`/`endCatLayer`) so a faint dark-grey sheen can be laid over it; whiskers go on after, crisp.
- Tail: bushy (thin at the root, full along its length, rounded tip with a tuft) and a chain of angular springs: the root follows the line of the rump, each segment chases its parent plus a curl, stiffness falls toward the tip, so motion ripples down it smoothly; it sweeps over the back on a turn-around and lifts for balance on landing.
- The drawn torso sits `RIG_LIFT` px above the physics center; collision still uses the unchanged torso collider. Modelled on photos of long-haired black cats, the body is deep (`BODY_OUTLINE`: a full chest and a low belly that doesn't tuck up, with long locks on the chest, belly and britches) and rides low on short, thick legs: below the belly fur only about a third of the cat's height shows as leg.
- The belly and loose coat lag the body (`pose.loose`): bouncy springs pushed by its change of speed swing the belly down on a landing or a take-off and back or forward on a start or stop; standing, the chest and belly swell a little with each breath. Speeding up stretches the spine and braking bunches it; walking flexes it and rocks the body a little each stride.
- Landing squash, leap stretch and dust puffs are visual only; jump timing and physics are unchanged.
- Movement tuning lives in the `RUN_SPEED`/`LEAP_SPEED`/`GRAVITY`/`FALL_BOOST`/`JUMP_CUT` constants: a held jump rises ~300px in 0.42s and lands after ~0.8s; a tapped hop rises ~170px; a running take-off leaps forward at `LEAP_SPEED`. Take-offs get a stretch, speed lines and a bigger dust kick; a big drop shakes the room a little.
- The cat body has no friction or air drag in Matter; the controller sets horizontal speed each frame, so running speed is the same at 60 Hz and 120 Hz.
- Ground stepping: a planted paw stays put while the body moves over it; a swinging paw aims half a stride ahead of where the hip will be at touchdown. `gaitParams(speed)` raises the step rate so the planted stride (speed × duty / cadence) stays within reach, and blends leg phase offsets between gaits so speeding up never snaps the legs. When running the cat crouches a little, keeps its back nearly level and holds its head level. A leg that can't reach its planted paw (`leg.strained`) steps. After a stop, spread paws step back under the body one at a time.
- Leg rig (modelled on a hand-drawn walk/sneak/jump reference, https://www.youtube.com/watch?v=v7KANqGGis4, slow-motion footage of real cats jumping, and side-view photos of standing and walking black cats). Standing (`standX`), the forelegs are straight with the paw under the elbow and the long hind foot stands nearly upright with the hock a third of the way up; moving, strides centre on `stanceX`. Hind legs are thigh, shin and a long foot standing on its toes (knee forward, hock back); forelegs hang from a shoulder blade that rocks with the stride, bend back at the elbow, and end in a short paw. Paw placement works on the toes; `distalAngle` (in `src/cat-motion.js`) sets the foot/paw angle below the hock or wrist, and two-bone IK solves the joints above. A planted paw rolls onto its toes as the body passes; a lifting forepaw folds back at the wrist and the hind foot flexes at the hock, then both reach forward to land. `swingFootPoint` lifts a paw before it travels forward.
- Sneak (`cat.pose.sneak` blends in): the chest sinks near the floor, the shoulder blades hunch up above the back, the head drops to the line of the back and the tail stays low.
- Leaps: a jump from the ground starts with a quick crouch onto the hind legs (`JUMP_CROUCH`, shorter from a run; off a ledge it goes at once). At take-off the body rears up about the shoulders (`pose.launch`, see `bodyCenter()`), the forepaws snap up under the chest and the hind paws stay planted, toes last, until the straightening legs can't reach them (`leg.pushing`). Over the top it stretches long; coming down it pitches well nose-down (up to 0.62 rad, more the faster it falls, so a drop from the bookcase leans hard) with the forepaws reaching for the ground and the hind legs tucked, so the forepaws touch down first and the hind paws then step down under the hips (`leg.landing`). The gaze follows the shoulders: up on the way up, down at the landing. Air leg targets and paw angles come from `computeAirLegTarget`.
- The cat has fluffy grey fur behind its ears and down the nape (`EAR_FUR`, `PALETTE.earFur`): a soft grey glow over the back of the head and soft grey locks past its outline.
- The gaze's height above the body (not its height in the room) runs through a spring filter (`createSecondOrder`/`stepSecondOrder` in `src/cat-motion.js`), so the head settles calmly after landings and pose changes but goes up and down with a leap; filtering the room height made the head trail a jump and droop on the way up. The forward reach eases between poses, measured from the body in the facing direction so it never lags a run or a turn; zoomies rock the body once per stride; the ears turn back at a run, flatten when sneaking and flick now and then.
- The dog (`src/dog.js`, tested in `tests/dog.test.mjs`; drawn in index.html) follows a Hildebrand gait table for a rotary gallop (touchdown phase per leg, 30% duty, so it has a moment with all paws in the air), from the procedural quadruped study at https://github.com/monjar/Advanced-Procedural-Animations-Study and Muybridge's 1887 photographs of a galloping dog. Planted paws stay put; swings run relative to the body; the spine gathers and extends once per stride and the body rocks and bobs; the head height is spring-filtered so it floats steady; floppy ears and a wagging tail are springs. Legs are built like the cat's (digitigrade, paw angle first, then two-bone IK). Its bump box (`dogHitBox`) is a little smaller than it looks, so a nearly-in-time jump clears it.
- The open floor between the table and the box holds a mouse hole, a window high on the wall (sky with drifting clouds, hills, a tree, long curtains that stir; light falls on the floor below; its sill is a perch reached by a full jump), the sisal scratching post (its carpeted top is a perch a little higher than the table; a pompom toy hangs from it on a string and swings, with a jingle, when the cat bats it), another hole and the floor lamp. The bird perches on the sill and the post too.
- Curtains (`world.curtains`, `tryCling`/`updateCling`): a leap up into a curtain from beside the window (`cat.leapt`, flying up and toward it, chest above the sill + 20 px) gets the cat's claws stuck. It hangs nearly upright on the cloth (`CLING_TILT`): forepaws stretched up with claws in it, hind feet braced and scrabbling, tail hanging and lashing, head turned out, the cloth pulled into folds toward its paws, slipping down a little now and then. After `CLING_TIME` (each key press wriggles it free sooner, down to `CLING_MIN`) it drops, kicking off the way an arrow points, and turns to land on its feet. "Stuck!", a fwump and a mew. Stepping off furniture, a low pounce at a mouse, or a cat over the sill never gets caught, and after coming free the curtains leave it alone for `CLING_REST` s. In bot play from wave 6 it caught the cat about once every 15 s of busy chasing near the window.
- Furniture: the table top, the window sill, the scratching post's top and the bookcase's cupboard top, shelf and top are one-way platforms (`world.platforms`). Each has a Matter body with its own collision category; the cat's collision mask drops a platform while the cat is rising, below its top, or dropping through. Platform bodies are `PLATFORM_EDGE_INSET` narrower than drawn so physics and `surfaceUnderCat()` agree on what counts as standing. `supportSurfaceYForFoot` picks the highest surface under a paw that is below the hip. The table and bookcase are painted into the backdrop. The table top and the cupboard top sit 180px up, just above a tapped hop, so hopping at a mouse never strands the cat on furniture; a held jump climbs.
- A fast landing can sink a few pixels into the box top for one physics step; `updatePhysics` settles it on top before `resolveSidePenetration`, which would otherwise treat it as a side hit and shove the cat off the box.
- Game rules live in `src/game-rules.js` (tested in `tests/game-rules.test.mjs`): `waveConfig(n)` sets mice per wave, how many are out at once, peek time, run/flee speed and reaction time, and unlocks brown mice (wave 2), catnip (wave 3) and the golden mouse (wave 4). Scoring (`scoreBoop`): kind points × 2 for a flying boop × streak (boops within 3s chain up to ×5). A cleared wave pays `wave × 50`, +100 and a piece of cheese back if no cheese was lost.
- Cheese: 5 pieces. A mouse that reaches a hole other than its own steals one; a mouse scared back into its own hole rejoins the wave queue. The golden mouse never steals. Out of cheese ends the game.
- Mice always cross to the hole farthest from where they came out, and peek (eye glint plus a chirp) before running, so the player can get there.
- Catnip appears on a random piece of furniture from wave 3; touching it gives 7s of zoomies (1.4× speed, slightly higher jumps, longer paw reach).
- Sound effects are synthesized with Web Audio in `src/sfx.js`; audio starts on the first key press.
- Mouse game: holes are placed in `layoutRoom()`: one between the bookcase and the table, two over the open floor between the table and the box. Mice peek, run between holes carrying cheese, freeze then flee when the cat comes close, and ignore a cat up on any furniture. Front paws near the floor boop a mouse in front of the chest (the near forepaw does a little tap); a flying boop is one while airborne or within 0.25s of landing. A booped mouse drops its cheese, gets a heart and trots home; it no longer counts for the wave. The best score is kept in `localStorage`.
- Playwright capture workflow exists in `scripts/playwright-cat-check.mjs` for repeatable movement validation.

## Iteration Workflow
1. Run unit tests
- `npm test`

2. Run visual movement capture
- `node scripts/playwright-cat-check.mjs /tmp/pw_cat_eval_runX http://127.0.0.1:5500/index.html`

3. Review output frame groups
- `walk_right_*`, `jump_right_*`, `walk_left_*` for gait and jump shape.
- `debug_hitbox_*` for contact correctness at obstacle edges.

## Assumptions
- Side-view platformer style motion (horizontal traversal + jumping).
- Up/down arrows are ignored; horizontal control is left/right only.
- The furniture doubles as lookout spots (mice don't notice the cat up there) and as places for catnip.
- Bonus animals (`critters` in index.html, points in `CRITTER_POINTS`): they roam on every screen, score only during a game, and use the same boop rules (head or front paw within reach, flying boops ×2, streaks). Grasshoppers sit on any surface and make big escape hops when the cat comes close; flies wander the air, rest on furniture and dart away from the cat's head; the bird perches on the hanging lamp, the bookcase top, the floor lamp and the box, sometimes pecks on the floor, and is the most alert (spots a running cat from far, reacts in 0.15s, and a bump of its lamp startles it). Sneaking (`sneakFactor`) shrinks how far every animal notices the cat. A booped grasshopper boings away, a fly loops off dizzy, the bird flutters off with a heart and returns 15–25s later.
- Local dev server: `python3 scripts/serve.py` (used by `.claude/launch.json`) is `http.server` with `Cache-Control: no-store`, so browsers never run stale copies of the `src/` modules.
- Fixed room and scrolling view: the room is laid out once (`layoutRoom`): bookcase, table, hole, window and curtains, post, hole, floor lamp and box across 1920 units, with the open floor between the table and the box spread in proportion to `ROOM_W`, so changing that one number widens or narrows the room. The view shows two thirds of it and follows the cat sideways (`updateCamera`): a short lag (`CAMERA_FOLLOW`), a look-ahead the way the cat faces (`CAMERA_LEAD`) that swings over slowly when it turns (`CAMERA_TURN`), and it stops at the ends of the room. The room doesn't scroll up and down. The static room is pre-rendered once per window size into a whole-room backdrop (capped at `BACKDROP_MAX_SCALE` device pixels per unit) and only the part in view is drawn. The vignette, the HUD and the edge badges are drawn in view space.
- Out of sight: a mouse outside the view gets a badge at that edge of the view (the mouse with its cheese, facing the way it runs, and an arrow; blinking while it peeks; nearest at the bottom, up to four a side). The "Woof!" badge stays up until the dog has run into view, above any mouse badges. Popups are kept inside the view, so "Cheese stolen!" shows even when it happens out of sight.
- High scores (`src/high-scores.js`, tested in `tests/high-scores.test.mjs`; stored under `cheese-chase-high-scores` in localStorage): the top `HIGH_SCORE_COUNT` (5) games with name, score and wave. A game that ends with a score that makes the list asks for a name on the game-over card (`game.entry`): typing starts once the card's prompts appear (`RESTART_DELAY`), so keys held from the game don't type; letters, digits, spaces and `'.-`, up to `NAME_MAX` (12); Enter saves, Esc skips; browser shortcuts are left alone. The box starts with the last name saved (`cheese-chase-player-name`), so a returning player just presses Enter. A tie goes below the scores already there. Unnamed scores show as "Mystery cat"; a best score saved before the list existed (`cheese-chase-best-score`, still kept for the HUD's Best) starts the list as one. Unreadable stored data is ignored.
- Published at https://peterbriers.be/catwalk/ (the GitHub Pages site of the `peebeebee/catwalk` repo; `.github/workflows/pages.yml` runs the tests and publishes `index.html`, `manifest.webmanifest`, `sw.js`, `icons/`, `src/` and `vendor/` on every push to `main`). matter-js is a copy in `vendor/`, so the site needs no `node_modules`. It is an installable web app: `manifest.webmanifest` (fullscreen, landscape, icons rendered from the game's own cat, with a maskable one) and `sw.js`, which fetches network first and keeps every file for offline play; `tests/site.test.mjs` checks that its file list covers every module in `src/`. The service worker is not registered on localhost, so local edits are never served stale.
