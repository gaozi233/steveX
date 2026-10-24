const express = require('express')
const path = require('path')
const { registerRoutes } = require('./routes')

/**
 * Create and configure the Express application.
 * @param {import('../../agent/agent_manager').AgentManager} manager
 * @returns {import('express').Express}
 */
function createApp(manager) {
  const app = express()

  // JSON body parser
  app.use(express.json())

  // Static files — serve index.html, style.css, app.js from public/
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    maxAge: 0,
    etag: false,
    lastModified: false
  }))

  app.get('/agents/:name', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')))
  app.get('/agents', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')))
  app.get('/configs', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')))

  // API routes include the final 404 handler.
  registerRoutes(app, manager)

  return app
}

module.exports = { createApp }
