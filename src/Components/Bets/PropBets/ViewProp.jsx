import React from 'react';

const ViewProp = ({bets}) => {



    return ( 
        <div>
            {bets.options.length > 0 ? (
                <div>
                    <h4><span>Betting</span></h4> 
                    <div className="pl-8">
                        {bets.options.map((option, index) => (
                            <div key={index}>
                                <p>{option}</p>
                            </div>
                        )
                        )}
                    </div>
                </div>
            ): (null)}
        </div>
            
            
        
    );
};

export default ViewProp;
