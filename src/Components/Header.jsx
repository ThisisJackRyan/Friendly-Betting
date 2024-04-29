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

        <div className=" max-h-24">
            <div className=" flex justify-start">
                <Link className=" ease-in no-underline text-black" to="Friendly-Betting/">
                    <div className="p-4 pt-8 text-shadow flex justify-start items-center text-5xl">
                        <span className="font-sans font-thin">FR</span>
                        <span className="font-serif font-bold text-2xl">IE</span>
                        <span className="font-sans font-thin">NDLY &nbsp;</span>
                        <span>Bets</span>
                    </div>
                </Link>
            </div>
            
            <div className="fixed flex top-0 right-0 h-24">
                
                    <Link className="flex rounded-bl-2xl betLink pt-8 p-4 no-underline text-black" to="Friendly-Betting/Bet" >
                        <span className="flex items-center justify-center z-10">View Bets</span>
                    </Link>
                
            </div>
            <div className="fixed-center-x top-0 h-24">
                <CSSTransition
                    in={(location.pathname === "/Friendly-Betting/Bet")}
                    timeout={300}
                    classNames="createBet"
                    unmountOnExit              
                >
                    <div className="h-full">
                        <div onClick={swapDisplay} className=" h-full flex bg-spring-green-light box-shadow rounded-b-2xl pl-8 pr-8 justify-center items-center">
                            <span className="flex justify-center items-center">Create One!</span>
                        </div>
                    </div>
                </CSSTransition>
            </div>
            <CSSTransition
                in={display}
                timeout={300}
                classNames="createBet"
                unmountOnExit              
            >
                <BetNav swap={swapDisplay}/>
            </CSSTransition>
        </div>
    )
}

export default Header;