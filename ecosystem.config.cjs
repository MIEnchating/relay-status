module.exports = {
  apps: [
    {
      name: 'relayai-status',
      script: '.output/server/index.mjs',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '3001',
        NITRO_HOST: '0.0.0.0',
        NITRO_PORT: '3001'
      }
    }
  ]
}
