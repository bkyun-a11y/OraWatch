import Dashboard from '../components/Dashboard';

export const metadata = {
    title: 'Oracle Watch | Monitoring',
    description: 'Enterprise Session & Lock Monitor',
};

export default function Home() {
    return (
        <main>
            <Dashboard />
        </main>
    );
}
