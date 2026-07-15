module.exports = {
  apps: [
    {
      name: 'Podcast_backend',
      script: './src/app.js',
      cwd: '/home/ubuntu/Podcast_backend',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
