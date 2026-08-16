import { Helmet } from 'react-helmet-async';
import { SITE, PAGE_KEYWORDS } from '../config/seo.js';

export default function SEO({ title, description, path = '', keywords }) {
  const pageUrl = path ? `${SITE.url}${path}` : SITE.url;
  const kw = keywords || PAGE_KEYWORDS[path.replace(/^\//, '')] || PAGE_KEYWORDS.home;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={kw} />
      <link rel="canonical" href={pageUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={pageUrl} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE.name} />
      <meta property="og:image" content={SITE.image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={SITE.twitter} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={SITE.image} />
    </Helmet>
  );
}
