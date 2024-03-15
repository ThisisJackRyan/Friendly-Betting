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
        <div className="sticky top-0 bottom-0 right-0 left-0 w-full flex justify-between">
            <Link className="ease-in no-underline text-black" to="Friendly-Betting/">
            <div className=" bg-spring-green-light box-shadow rounded-br-2xl p-4 pt-8 text-shadow flex justify-start items-center text-5xl">
                <span className="font-sans font-thin">FR</span>
                <span className="font-serif font-bold text-2xl">IE</span>
                <span className="font-sans font-thin">NDLY &nbsp;</span>
                <span>Bets</span>
            </div>
            </Link>
            
            <CSSTransition
                in={(location.pathname === "/Friendly-Betting/Bet")}
                timeout={300}
                classNames="createBet"
                unmountOnExit              
            >
                <div>
                    <div onClick={swapDisplay} className="h-full flex bg-spring-green-light box-shadow rounded-b-2xl pl-8 pr-8 justify-center items-center">
                        <span className="flex justify-center items-center">Create One!</span>
                    </div>
                </div>
                
            </CSSTransition>
    
            <Link className="flex box-shadow  bg-spring-green-light rounded-bl-2xl betLink p-8 pb-4 no-underline text-black" to="Friendly-Betting/Bet"><span className="flex items-center justify-center">View Bets</span></Link>
            {display ? <BetNav swap={swapDisplay}/> : null}

        </div>
    )
}

export default Header;