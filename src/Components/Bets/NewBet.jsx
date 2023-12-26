import Players from "./Players/Players";
import DisplayAllBets from "./DisplayAllBets";



const NewBet = () => {
    return (
        <div className="flex ">
            <div className="x2">
                <DisplayAllBets />
            </div>
            <div className="x1">
                <Players />
            </div>
        </div>
    )
}

export default NewBet;