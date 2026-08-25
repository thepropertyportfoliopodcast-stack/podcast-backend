module.exports = {
  apps: [
    {
      name: 'podcast-backend',
      script: './src/app.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
