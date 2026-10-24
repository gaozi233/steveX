function agentSummary(agent) {
  return { name: agent.name, username: agent.username, online: agent.online,
    health: agent.health, maxHealth: agent.maxHealth, gameMode: agent.gameMode,
    position: agent.position, currentAction: agent.currentAction,
    brain: agent.brain ? { running: agent.brain.running, task: agent.brain.task ? { id: agent.brain.task.id, status: agent.brain.task.status } : null } : null }
}
module.exports = { agentSummary }
