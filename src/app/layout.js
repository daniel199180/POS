import "./app.css";

export const metadata = {
  title: "POS V1",
  description: "Punto de venta con autenticacion Appwrite",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/appwrite.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" type="image/svg+xml" href="/appwrite.svg" />
      </head>
      <body
        className={"bg-neutral-950 font-[Inter] text-neutral-100 antialiased"}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
