# Survival implementation contracts

These contracts describe the production modules and fixed-step session, rather
than visual sprite footprints. Distances are tiles and times are seconds.
[Geometry contracts](geometry.md) define the shared query boundary.

## Survival and tick ownership

`src/config.js` fixes health and armor caps at **5**, initial armor at **0**,
damage at **1**, and every successful cake/charm pickup at **1**. All contact
and rose hits share **0.75 seconds** of invulnerability. `src/survival.js` owns
pure transitions; consumers adopt returned state and queue each non-null event
once. Armor absorbs damage before health. Blocked hits emit no damage event
and do not extend invulnerability. Healing never revives zero health and never
resets invulnerability.

`GameSession.update` advances elapsed time and player movement first;
`updatePlayer` advances shared invulnerability exactly once. The session then
collects supplies, resolves rainbow conversions, updates unicorn navigation and
contact, advances existing roses, and updates ranged attacks. Thus supplies can
protect against a hit on that tick, contact precedes rose damage, and converted
unicorns cannot fire. Roses emitted last remain at their socket for the first
rendered frame. Defeat takes precedence over clearing/healing; dead actors are
removed after that check.

Clearing a wave removes airborne roses and starts a **2-second** intermission,
with movement, firing, and old supplies still available. At the start of waves
2 and 3, restore exactly one health (capped at five), spawn the next herd, and
replace supplies. Wave 3 wins immediately without a further heal. Simulation
uses 60 Hz steps with at most five catch-up steps per animation frame.

## Point-projectile collision

`src/projectiles.js` stores roses in the session, with monotonically allocated
`rose:<counter>` IDs, normalized velocity at **3.5 tiles/second**, a **3-second**
lifetime, and a cap of **32**. Cap rejection consumes no ID and replaces no
existing projectile. Height `z` (normally 0.5), petals, and stem are decorative:
there is no projectile collision radius.

`updateRoses` sweeps the lifetime-limited segment through hedge ray geometry
and the player's radius. It uses relative displacement from the player's
pre-movement position to detect a player crossing a moving or stationary rose.
Wall and player intersections are compared as fractions of the same segment;
hedges win equal/roundoff-close ties. A stationary relative segment checks
initial point overlap. Wall impact, player contact, and expiry all remove the
rose; player contact consumes it even during invulnerability. Accepted damage
queues one event at the world impact point. Converting a source does not remove
its previously fired roses; clearing the wave does.

## Rear socket and rendering alignment

`rearSocket` in `src/ranged-attacks.js` is the authoritative world origin:
`(unicorn.x - cos(angle) * 0.35, unicorn.y - sin(angle) * 0.35)`. It is beyond
the 0.25-tile body radius, opposite the forward vector. Eligibility requires
clear hedge visibility both from body to socket and from socket to target.

During windup/recovery, `src/sprite-presentation.js` draws `unicornRear` at that
same socket and **z = 0.5**. `UNICORN_REAR_RUMP_ANCHOR` in `src/art.js` is
**(64, 100)** in the **128 × 160** sprite. Align this anchor, rather than the
sprite center, to the projected socket. The emitted rose's center shares this
screen point and depth; roses draw above their source at equal depth. Shared
wall-depth clipping, stable depth/layer/key sorting, and footprint-aware
projection apply to supplies, rear poses, and roses. Rendering reads state;
it does not advance timers or consume simulation randomness. Reduced motion
does not change emission, collision, or trajectories.

## Deterministic supplies

`spawnPickups` in `src/pickups.js` enumerates radius-reachable cell centers from
a fresh player-clearance distance field. It excludes solid cells, pickup-radius
wall overlap, and initial overlap/tangency with the player or living unicorns.
A local seeded shuffle samples without replacement. The default stream key is
`<world seed>:<wave>:pickups`; it never advances the world/unicorn stream.
IDs are `pickup:<wave>:<index>`. The first three candidates are cakes and the
next five are charms. A crowded map returns fewer items, with bounded work
and no random-retry loop. Restarting identical inputs recreates IDs/positions;
later waves depend on the player's position at their start as well as the seed.

`collectPickups` requires overlap of player and pickup radii plus hedge line of
sight, after movement and before attacks. A successful collection removes the
item once and emits one event with `amount: 1` and resulting health/armor.
Full-resource, hidden, distant, or dead-player supplies remain available.
Invulnerability permits collection without changing its remaining duration.

## Attack timing

Each unicorn gets an independent RNG keyed by `[seed, id, 'ranged-attack']`,
giving an initial cooldown stagger in **[0, 2.6)**. This does not change spawn
positions or depend on update order. A target must be **1.25–7 tiles** away
and visible. Starting windup copies its position and turns the unicorn's front
away from it, so the rear faces that snapshot. Aim does not track subsequent
player movement.

The state machine is idle → **0.55-second windup** → **0.25-second recovery**
→ idle. Navigation and facing freeze during windup/recovery. Completion emits
at most one rose and starts a full **2.6-second cooldown**; recovery counts
toward that cooldown. Each new phase receives its full duration: oversized
updates do not subtract overshoot from a new phase or replay overdue shots.
Floating-point tolerance expires timers at the intended fixed-step boundary.

Conversion cancels future actions. Loss of current-target range/visibility or
obstruction of the socket/copied aim cancels windup and spends a cooldown.
Capacity rejection also spends a cooldown, so freeing a slot cannot release a
queued shot. All timers use simulation seconds, never wall-clock callbacks.

## Lifecycle and feedback

Pause stops session updates, freezing airborne roses, pickups, shared
invulnerability, windup, recovery, and cooldown. Resume establishes a fresh
clock baseline without hidden-time catch-up. Blur, visibility loss, pointer
loss, and pagehide pause/clear controls through the app/input lifecycle.

Restart creates a fresh same-seed world/player/herd/supplies, clears roses,
resets the rose ID counter, timers, score, combo, elapsed time, and event queue.
It also clears effects/recoil/held input and stops prior audio, retaining best
score, mute, and reduced-motion preferences. Results freeze authoritative
simulation; cosmetic glitter can finish animating. Defeat need not erase the
frozen arrays; restart replaces them.

`drainEvents` returns each batch once for effects, renderer, and audio. The eight
audio cues are shot, glitter, pickup, rose-fired, damage, wave, victory, defeat.
Pause/mute/destroy stop active sources; delayed audio activation cannot replay
events from a previous run. `app.destroy` cancels its animation callback,
removes listeners/HUD, releases pointer lock, clears effects, and destroys audio,
including partial startup failure. It stops ownership/updates rather than
mutating a retained session snapshot. No independent rose/supply timers exist.

Attack speed/range/timing, supply counts, and cosmetic defaults are initial
tuning values. Change them only with recorded human playtest findings and a
repeat verification run. The five-health/five-armor/one-point rules are fixed.
