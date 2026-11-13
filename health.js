// Naina webhook bot — health check for the Vercel deployment.
// GET /api/health -> 200 {"status":"ok"}
// (Vercel serverless never sleeps like Render free, so no keep-alive
// ping is needed — this is just for quick "is it up?" checks.)
module.exports = (req, res) => {
  res.status(200).json({ status: 'ok' });
};
