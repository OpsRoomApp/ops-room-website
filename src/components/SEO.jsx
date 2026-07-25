import { Helmet } from 'react-helmet-async';
import { SITE } from '../config/seo.js';

export default function SEO({ title, description, path = '' }) {
  const pageUrl = path ? `${SITE.url}${path}` : SITE.url;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={pageUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={pageUrl} />
      <meta property="og:image" content={SITE.image} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={SITE.image} />
    </Helmet>
  );
}
