


const Header = (props) => {
    return(
        <div className="header">
            <div className="x1">
                <div className="logo">logo</div>
            </div>
            <div className="x1">Title of website</div>
            <div className="flex pages x1">
                <div>other pages</div>
                <button onClick={props.newBet}>Create New Bet</button>
            </div>
        </div>
    )
}

export default Header;