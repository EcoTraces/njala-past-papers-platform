import { StaticPage } from './StaticPage';

export function About(): JSX.Element {
  return (
    <StaticPage title="About the platform">
      <p>
        The Njala Past Papers &amp; Exam Practice Platform gives students a centralized, searchable and secure place
        to find verified past examination papers, and to practice with auto-marked questions before an exam.
      </p>
      <p>
        Every paper published on the platform has gone through a verification workflow: a lecturer or library staff
        member uploads it, it is submitted for review, checked by library staff, approved, and only then published
        for students to see. Unverified or rejected papers are never visible to students.
      </p>
      <p>
        The platform is built for Njala University, Sierra Leone, with an architecture designed to extend to other
        institutions without a rewrite.
      </p>
    </StaticPage>
  );
}
