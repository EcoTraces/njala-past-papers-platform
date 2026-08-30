import { StaticPage } from './StaticPage';

export function Contact(): JSX.Element {
  return (
    <StaticPage title="Contact">
      <p>For account or paper issues, contact your faculty library desk or the platform administrator at your
      institution.</p>
      <p>This is a reference deployment; wire this page to your institution's real support channel before going
      live.</p>
    </StaticPage>
  );
}
