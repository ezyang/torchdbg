# torchdbg

torchdbg is two things:

* A tracer that dumps all PyTorch operations that occur in your program to a
  structured log (formatted compatibly with
  [tlparse](https://github.com/ezyang/tlparse))

* A React UI for visualizing the traces produced above, in the same style
  as a single-stepping debugger.

![image](https://github.com/ezyang/torchdbg/assets/13564/912dff04-fb5d-4ea8-a99c-42e73bb4222f)

This is an Easter vacation hack from @ezyang, I don't currently have plans to
keep pushing this further but maybe the community is willing to pick this up
and run with it.

## How to use



First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
