import { Link, useLocation} from "react-router-dom";



const Header = () => {
    const location = useLocation();

    return(
        <div className="header">
            <div className="x1">
                <div className="logo"><Link className="link" to="Friendly-Betting/">
                    <img src="https://placehold.co/60x60" alt="" />
                </Link>
                </div>
            </div>
            <div className="x1 text-shadow flex justify-start items-center text-5xl">
                <span className="font-sans font-thin">FR</span>
                <span className="font-serif font-bold text-2xl">IE</span>
                <span className="font-sans font-thin">NDLY &nbsp;</span>
                <span>Bets</span>
            </div>
            <div className="flex pages x1">
                {location.pathname !== "/SignIn" ? <Link className="Link" to="Friendly-Betting/SignIn">Sign In</Link>: <Link className="Link" to="/">Sign In</Link>}
                    <Link className="Link betLink" to="Friendly-Betting/Bet">Bets</Link>
                    <Link className="Link" to="Friendly-Betting/Friends">Friends</Link>
            </div>
        </div>
    )
}

export default Header;