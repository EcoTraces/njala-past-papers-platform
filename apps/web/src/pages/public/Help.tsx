import { StaticPage } from './StaticPage';

export function Help(): JSX.Element {
  return (
    <StaticPage title="Help">
      <h2>Getting started</h2>
      <p>Students sign up with their Student ID and a password. Staff accounts are provisioned by an administrator.</p>
      <h2>Finding a paper</h2>
      <p>Use Browse Papers to search by course, faculty, department, academic year, semester or examination type.</p>
      <h2>Practicing</h2>
      <p>
        Start a practice session from a course or a specific paper. Multiple choice, true/false and numerical
        questions are marked automatically as you answer; essay and short-answer questions are marked by a lecturer
        or library staff member afterwards.
      </p>
      <h2>Uploading a paper (lecturer/library staff)</h2>
      <p>Upload a PDF with the course, academic year, semester and examination type. It starts as a draft, then
      moves through submission and review before publication.</p>
      <h2>Still need help?</h2>
      <p>See the Contact page.</p>
    </StaticPage>
  );
}
