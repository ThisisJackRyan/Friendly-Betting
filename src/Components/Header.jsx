import { Link, useLocation} from "react-router-dom";
import { useEffect, useState } from "react";
import BetNav from "./Bets/BetNav";
import { CSSTransition } from "react-transition-group";



const Header = () => {
    const location = useLocation();
    
    const [display, setDisplay] = useState(false)
    const swapDisplay = () => {
        setDisplay((current) => !current)
    }

    useEffect(() => {
        if(location.pathname !== "/Friendly-Betting/Bet"){
            setDisplay(false)
        }
    }, [location])


    return(
        <div className="">
            <div className=" flex justify-center">
                <Link className=" ease-in no-underline text-black" to="Friendly-Betting/">
                    <div className="p-4 pt-8 text-shadow flex justify-start items-center text-5xl">
                        <span className="font-sans font-thin">FR</span>
                        <span className="font-serif font-bold text-2xl">IE</span>
                        <span className="font-sans font-thin">NDLY &nbsp;</span>
                        <span>Bets</span>
                    </div>
                </Link>
            </div>
            
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