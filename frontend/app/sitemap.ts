import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.finalcut.ai';

  return [
    {
      url: `${base}/`,
      changeFrequency: 'hourly',
      priority: 1,
    },
    {
      url: `${base}/explore`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${base}/docs`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${base}/search`,
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${base}/workbench`,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${base}/llms.txt`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    // Dynamic sitemap entries will be generated at runtime for topics and profiles
    // based on the explore data and user profiles
  ];
}
