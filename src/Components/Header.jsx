import { Link, useLocation } from "react-router-dom";
import Logo from "./Components/Static/Logo";
import { CSSTransition } from "react-transition-group";

const Header = () => {
    const location = useLocation();
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const isCreate =
        path === '/' ||
        path === '/Friendly-Betting' ||
        path.endsWith('/MoneyLineBets') ||
        path.endsWith('/edit');
    const showBetList = path !== '/Friendly-Betting/Bet' && !isCreate;

    return (
        <div>
            <Logo />
            <CSSTransition
                in={showBetList}
                timeout={300}
                classNames="fadeUp"
                unmountOnExit
            >
                <Link
                    to="/Friendly-Betting/Bet"
                    className="fixed bottom-0 left-1/2 z-10 flex h-16 w-full max-w-[420px] -translate-x-1/2 items-center justify-center rounded-t-md bg-spring-green-light"
                >
                    View Bets
                </Link>
            </CSSTransition>
        </div>
    );
};

export default Header;
