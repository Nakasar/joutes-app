"use client";

import ReactMarkdown from "react-markdown";

type NewsContentProps = {
  content: string;
};

export default function NewsContent({ content }: NewsContentProps) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
