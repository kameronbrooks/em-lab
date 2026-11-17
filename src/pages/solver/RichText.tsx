import { Fragment } from 'react';
import { Tex } from '../../ui/controls';

/** Text with inline LaTeX between dollar signs: "the field is $E = \sigma/\epsilon_0$". */
export function RichText({ text }: { text: string }) {
  const parts = text.split('$');
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <Tex key={i}>{part}</Tex> : <Fragment key={i}>{part}</Fragment>))}
    </>
  );
}
