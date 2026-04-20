document.addEventListener('DOMContentLoaded', () => {
    const nameInput       = document.getElementById('nameInput');
    const goBtn           = document.getElementById('goBtn');
    const peopleContainer = document.getElementById('people-container');
    const leaderboardList = document.getElementById('leaderboardList');

    nameInput.value = "Alice\nBob\nCharlie\nDiana\nEve";

    let animationInterval = null;
    let participants      = [];
    let backgroundActors  = [];
    let finishes          = [];

    /** Vibrant HSL colour for named participants */
    function getRandomColor() {
        const hue = Math.floor(Math.random() * 360);
        return `hsl(${hue}, 85%, 65%)`;
    }

    /** Read the centre-X of each .gate relative to .simulation-area */
    function getGatePositions() {
        const simRect = document.querySelector('.simulation-area').getBoundingClientRect();
        return Array.from(document.querySelectorAll('.gate')).map(gate => {
            const r = gate.getBoundingClientRect();
            return r.left - simRect.left + r.width / 2;
        });
    }

    /**
     * Build an SVG stick figure string.
     * viewBox 0 0 24 36  —  head: cx=12 cy=5 r=4
     *                         body: (12,9)→(12,23)
     *  arm-l: <g> wrapping line (12,13)→(4,20)   pivot at right-top of fill-box = (12,13)
     *  arm-r: <g> wrapping line (12,13)→(20,20)  pivot at left-top  of fill-box = (12,13)
     *  leg-l: <g> wrapping line (12,23)→(5,34)   pivot at right-top of fill-box = (12,23)
     *  leg-r: <g> wrapping line (12,23)→(19,34)  pivot at left-top  of fill-box = (12,23)
     */
    function makeFigure(color, isBackground, walkSpeed, walkDelay) {
        const c   = isBackground ? '#3d5060' : color;
        const sw  = isBackground ? '1.5' : '2';
        return `<svg class="figure" viewBox="0 0 24 36" width="24" height="36"
                     xmlns="http://www.w3.org/2000/svg"
                     style="--walk-speed:${walkSpeed}s;--walk-delay:-${walkDelay}s">
  <circle cx="12" cy="5" r="4" fill="${c}"/>
  <line x1="12" y1="9" x2="12" y2="23" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>
  <g class="arm-l"><line x1="12" y1="13" x2="4"  y2="20" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/></g>
  <g class="arm-r"><line x1="12" y1="13" x2="20" y2="20" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/></g>
  <g class="leg-l"><line x1="12" y1="23" x2="5"  y2="34" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/></g>
  <g class="leg-r"><line x1="12" y1="23" x2="19" y2="34" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/></g>
</svg>`;
    }

    /** Spawn one person (named participant or anonymous background walker) */
    function spawnPerson(isBackground, name, targetX, areaWidth) {
        const wrapper = document.createElement('div');
        wrapper.className = isBackground ? 'person background' : 'person';

        const color     = getRandomColor();
        const walkSpeed = (0.35 + Math.random() * 0.25).toFixed(2);
        const walkDelay = (Math.random() * parseFloat(walkSpeed)).toFixed(2);

        wrapper.innerHTML = makeFigure(color, isBackground, walkSpeed, walkDelay);

        if (!isBackground) {
            const bubble = document.createElement('div');
            bubble.className = 'name-bubble';
            bubble.textContent = name;
            bubble.style.color = color;
            wrapper.appendChild(bubble);
        }

        // Spread start positions across the top of the area
        const startX = Math.random() * (areaWidth - 50) + 10;
        const startY = Math.random() * -100 - 20;   // stagger so they don't all arrive together

        wrapper.style.left = `${startX}px`;
        wrapper.style.top  = `${startY}px`;
        peopleContainer.appendChild(wrapper);

        return {
            element:      wrapper,
            name:         name,
            x:            startX,
            y:            startY,
            isBackground: isBackground,
            speedY:       Math.random() * 1.4 + 0.9,
            targetX:      targetX,
            hasPassed:    false
        };
    }

    /**
     * Move every entity one frame.
     * Key rule: steer smoothly and strongly toward the assigned gate,
     * then hard-clamp within the walkway in the gate zone so every
     * figure physically passes through.
     *
     * Gate walkway inner width ≈ 46 px, centred at targetX.
     * Figure is 24 px wide, so we allow ±11 px offset from targetX
     * (figure occupies targetX-12 … targetX+12).
     */
    function updatePhysics(entities, areaWidth, areaHeight) {
        const gateY      = areaHeight / 2;
        const clampRange = 11;   // max px the figure centre may deviate from gate centre

        entities.forEach(entity => {
            if (entity.y > areaHeight + 60) return;

            entity.y += entity.speedY;

            // Centre of this figure
            const centreX = entity.x + 12;
            const diff    = entity.targetX - centreX;

            if (entity.y < gateY + 30) {
                // Progressive steering: weak far away, very strong near the gate
                const t             = Math.max(0, entity.y) / (gateY + 30); // 0→top, 1→gate
                const steerStrength = 0.05 + t * 0.30;
                entity.x           += diff * steerStrength;

                // Minimal wobble only when well away from the centre-line
                if (Math.abs(diff) > 30) entity.x += (Math.random() - 0.5) * 1.5;

                // Hard clamp inside the gate zone (±20 px of gateY)
                if (entity.y > gateY - 20 && entity.y < gateY + 20) {
                    const minX = entity.targetX - 12 - clampRange;
                    const maxX = entity.targetX - 12 + clampRange;
                    entity.x   = Math.max(minX, Math.min(maxX, entity.x));
                }
            } else {
                // Past the gate: disperse gently
                entity.x += (Math.random() - 0.5) * 2.5;
            }

            entity.x = Math.max(0, Math.min(areaWidth - 24, entity.x));
            entity.element.style.left = `${entity.x}px`;
            entity.element.style.top  = `${entity.y}px`;

            if (!entity.hasPassed && entity.y > gateY + 55) {
                entity.hasPassed = true;
                if (!entity.isBackground) recordFinish(entity);
            }
        });
    }

    function recordFinish(entity) {
        finishes.push(entity.name);
        const li = document.createElement('li');
        li.textContent = entity.name;
        leaderboardList.appendChild(li);
    }

    function runSimulation() {
        goBtn.disabled = true;
        peopleContainer.innerHTML = '';
        leaderboardList.innerHTML = '';
        if (animationInterval) clearInterval(animationInterval);

        participants     = [];
        backgroundActors = [];
        finishes         = [];

        const names = nameInput.value
            .split('\n')
            .map(n => n.trim())
            .filter(n => n.length > 0);

        if (names.length === 0) {
            alert("Please enter at least one name.");
            goBtn.disabled = false;
            return;
        }

        const simArea       = document.querySelector('.simulation-area');
        const areaWidth     = simArea.clientWidth;
        const areaHeight    = simArea.clientHeight;
        const gatePositions = getGatePositions();

        // Named participants — each steered to a random gate
        names.forEach(name => {
            const targetX = gatePositions[Math.floor(Math.random() * gatePositions.length)];
            participants.push(spawnPerson(false, name, targetX, areaWidth));
        });

        // Background crowd: exactly 2× participants so total = 3× names
        const bgCount = names.length * 2;
        for (let i = 0; i < bgCount; i++) {
            const targetX = gatePositions[Math.floor(Math.random() * gatePositions.length)];
            backgroundActors.push(spawnPerson(true, '', targetX, areaWidth));
        }

        let frameCount  = 0;
        const maxFrames = 12 * 60; // 12 s ceiling

        animationInterval = setInterval(() => {
            updatePhysics(participants,     areaWidth, areaHeight);
            updatePhysics(backgroundActors, areaWidth, areaHeight);

            frameCount++;

            const allPassed = participants.every(p => p.hasPassed || p.y > areaHeight);
            if (allPassed || frameCount >= maxFrames) {
                clearInterval(animationInterval);
                goBtn.disabled = false;
                // Safety: add anyone who didn't formally cross
                participants.filter(p => !p.hasPassed).forEach(p => recordFinish(p));
            }
        }, 1000 / 60);
    }

    goBtn.addEventListener('click', runSimulation);
});
