function createSkillRegistry(skills = []) {
  const registered = skills.filter(Boolean);
  if (!registered.length) throw new Error("skillRegistry requires at least one skill");

  function resolve(event) {
    return registered.find(skill => skill.canHandle(event)) || null;
  }

  return {
    resolve,
    list: () => registered.map(skill => skill.id),
  };
}

module.exports = { createSkillRegistry };
