import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import stylesheet from '../workspace/workspace.css?url';
import sessionStylesheet from '../workspace/session.css?url';
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Satispire · Fabrikplanung' },
    ],
    links: [
      { rel: 'stylesheet', href: stylesheet },
      { rel: 'stylesheet', href: sessionStylesheet },
    ],
  }),
  component: () => (
    <html lang="de">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
