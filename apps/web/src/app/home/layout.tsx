import { HOME_THEME_BOOTSTRAP } from "@/lib/home/theme-script";

export default function HomeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: HOME_THEME_BOOTSTRAP }} />
      {children}
    </>
  );
}
