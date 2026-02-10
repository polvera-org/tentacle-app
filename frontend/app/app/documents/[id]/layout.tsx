// This layout provides generateStaticParams for the dynamic route
// Since documents are created dynamically, we return an empty array
// and rely on client-side rendering in the Tauri app
export async function generateStaticParams() {
  return [{id: 'placeholder'}]
}

export default function DocumentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}

