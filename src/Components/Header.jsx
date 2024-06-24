import { Link, useLocation} from "react-router-dom";
import Logo from "./Components/Static/Logo";
import { CSSTransition } from "react-transition-group";



const Header = () => {
    const location = useLocation();


    return(
        <div className="">
            <Logo />
            <div className="">
                     <CSSTransition
                     in={(location.pathname !== "/Friendly-Betting/Bet")}
                     timeout={300}
                     classNames="fadeUp"
                     unmountOnExit              
                >
                    <Link to="Friendly-Betting/Bet" className="bg-spring-green-light absolute bottom-0 w-full flex justify-center items-center h-20 rounded-t-md">
                        <span>
                            View Bets
                        </span> 
                    </Link>
                 </CSSTransition>
            </div>
        </div>
    )
}

export default Header;