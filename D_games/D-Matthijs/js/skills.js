/* MERGE-BLOCK: skills.js — skill tree definities & UI */
const SkillTree = (() => {
  const BRANCH_LABELS = {
    overleven: 'Overleven',
    bewegen: 'Bewegen',
    gevecht: 'Gevecht',
    natuur: 'Natuur'
  };

  const SKILLS = [
    {
      id: 'vitality',
      branch: 'overleven',
      icon: '❤',
      name: 'Levenskracht',
      desc: '+12 max HP per niveau',
      max: 3,
      cost: 1,
      requires: {}
    },
    {
      id: 'armor',
      branch: 'overleven',
      icon: '🛡',
      name: 'IJzeren huid',
      desc: '-10% schade per niveau',
      max: 2,
      cost: 1,
      requires: { vitality: 1 }
    },
    {
      id: 'speed',
      branch: 'bewegen',
      icon: '⚡',
      name: 'Snelheid',
      desc: '+7% loopsnelheid per niveau',
      max: 3,
      cost: 1,
      requires: {}
    },
    {
      id: 'jump',
      branch: 'bewegen',
      icon: '↑',
      name: 'Hoge sprong',
      desc: '+8% sprong per niveau',
      max: 3,
      cost: 1,
      requires: { speed: 1 }
    },
    {
      id: 'blade',
      branch: 'gevecht',
      icon: '⚔',
      name: 'Zwaardkunst',
      desc: '+12% melee-schade per niveau',
      max: 3,
      cost: 1,
      requires: {}
    },
    {
      id: 'archery',
      branch: 'gevecht',
      icon: '🏹',
      name: 'Boogschieten',
      desc: '+15% pijlschade per niveau',
      max: 2,
      cost: 1,
      requires: { blade: 1 }
    },
    {
      id: 'forager',
      branch: 'natuur',
      icon: '🌿',
      name: 'Verzamelaar',
      desc: '+25% plantgenezing per niveau',
      max: 2,
      cost: 1,
      requires: {}
    },
    {
      id: 'metabolism',
      branch: 'natuur',
      icon: '🍃',
      name: 'Sterke maag',
      desc: '-12% honger per niveau',
      max: 3,
      cost: 1,
      requires: { forager: 1 }
    }
  ];

  const skillMap = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

  function getSkill(id) {
    return skillMap[id] || null;
  }

  function meetsRequirements(ranks, skill) {
    if (!skill?.requires) return true;
    return Object.entries(skill.requires).every(([reqId, minRank]) => (ranks[reqId] || 0) >= minRank);
  }

  function computeBonuses(ranks = {}) {
    const r = (id) => ranks[id] || 0;
    return {
      hpBonus: r('vitality') * 12,
      damageReduction: Math.min(0.35, r('armor') * 0.1),
      speedMul: 1 + r('speed') * 0.07,
      jumpMul: 1 + r('jump') * 0.08,
      meleeDamageMul: 1 + r('blade') * 0.12,
      bowDamageMul: 1 + r('archery') * 0.15,
      plantHealMul: 1 + r('forager') * 0.25,
      hungerDrainMul: Math.max(0.55, 1 - r('metabolism') * 0.12)
    };
  }

  function getUpgradeStatus(ranks, points, skill) {
    const rank = ranks[skill.id] || 0;
    if (rank >= skill.max) return 'maxed';
    if (!meetsRequirements(ranks, skill)) return 'locked';
    if (points < skill.cost) return 'no-points';
    return 'available';
  }

  function renderPips(rank, max) {
    let html = '';
    for (let i = 0; i < max; i++) {
      html += `<span class="skill-pip${i < rank ? ' filled' : ''}"></span>`;
    }
    return html;
  }

  function renderSkillNode(skill, ranks, points) {
    const rank = ranks[skill.id] || 0;
    const status = getUpgradeStatus(ranks, points, skill);
    const reqText = Object.entries(skill.requires || {})
      .map(([id, min]) => {
        const reqSkill = getSkill(id);
        return reqSkill ? `${reqSkill.name} ${min}` : id;
      })
      .join(', ');

    return `
      <div class="skill-node skill-node-${status}" data-skill-id="${skill.id}">
        <div class="skill-node-main">
          <span class="skill-node-icon" aria-hidden="true">${skill.icon}</span>
          <div class="skill-node-info">
            <strong>${skill.name}</strong>
            <span class="skill-node-desc">${skill.desc}</span>
            ${reqText ? `<span class="skill-node-req">Vereist: ${reqText}</span>` : ''}
          </div>
          <button
            type="button"
            class="btn skill-upgrade-btn${status === 'available' ? ' success' : ''}"
            data-skill-upgrade="${skill.id}"
            ${status !== 'available' ? 'disabled' : ''}
            aria-label="${skill.name} upgraden"
          >+</button>
        </div>
        <div class="skill-node-foot">
          <div class="skill-pips">${renderPips(rank, skill.max)}</div>
          <span class="skill-rank-label">${rank}/${skill.max}</span>
        </div>
      </div>
    `;
  }

  function render() {
    const root = document.getElementById('skill-tree');
    const pointsEl = document.getElementById('skill-points-display');
    if (!root || typeof SideViewGame?.getSkillState !== 'function') return;

    const { skills, skillPoints } = SideViewGame.getSkillState();
    if (pointsEl) pointsEl.textContent = `${skillPoints} punt${skillPoints === 1 ? '' : 'en'}`;

    const branches = ['overleven', 'bewegen', 'gevecht', 'natuur'];
    root.innerHTML = branches.map((branch) => {
      const nodes = SKILLS.filter((s) => s.branch === branch)
        .map((s) => renderSkillNode(s, skills, skillPoints))
        .join('');
      return `
        <div class="skill-branch" data-branch="${branch}">
          <h4 class="skill-branch-title">${BRANCH_LABELS[branch]}</h4>
          <div class="skill-branch-nodes">${nodes}</div>
        </div>
      `;
    }).join('');

    root.querySelectorAll('[data-skill-upgrade]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-skill-upgrade');
        const result = SideViewGame.upgradeSkill(id);
        if (result.ok) {
          Toast.show(`${getSkill(id)?.name || 'Skill'} verbeterd!`);
        } else if (result.reason) {
          Toast.show(result.reason);
        }
        render();
        Character.refresh?.();
      });
    });
  }

  function init() {
    window.addEventListener('tabchange', (e) => {
      if (e.detail?.tabId === 'character') render();
    });
    render();
  }

  return {
    init,
    refresh: render,
    getSkill,
    SKILLS,
    computeBonuses,
    meetsRequirements
  };
})();
/* END-MERGE-BLOCK */
